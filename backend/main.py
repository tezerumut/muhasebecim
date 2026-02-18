import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import os

import jwt
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import Document, init_beanie, Indexed
import asyncio

# --- AYARLAR ---
# MongoDB URL'ini hem koddan hem de Render ortam değişkenlerinden alacak şekilde ayarladık
MONGODB_URL = os.environ.get("MONGODB_URL", "mongodb+srv://admin:Goldpony1234@cluster0.s9m6bix.mongodb.net/muhasebe_db?retryWrites=true&w=majority")
SECRET_KEY = "UMUT_SECRET_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# --- MODELLER (Beanie) ---
class User(Document):
    email: Indexed(str, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"

class Transaction(Document):
    user_id: str
    title: str
    amount: float
    type: str 
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: Optional[str] = None
    source_id: Optional[str] = None

    class Settings:
        name = "transactions"

class Bill(Document):
    user_id: str
    title: str
    amount: float
    due_date: Optional[str] = None
    is_paid: bool = False
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "bills"

# --- ŞEMALAR (Pydantic v2) ---
class AuthBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)

class TokenOut(BaseModel):
    token: str
    email: EmailStr

class TxCreate(BaseModel):
    title: str = Field(min_length=1)
    amount: float = Field(gt=0)
    type: str = Field(pattern="^(income|expense)$")

class TxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: str = Field(alias="_id")
    title: str
    amount: float
    type: str
    created_at: datetime
    source: Optional[str] = None

class BillCreate(BaseModel):
    title: str = Field(min_length=1)
    amount: float = Field(gt=0)
    due_date: Optional[str] = None

class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: str = Field(alias="_id")
    title: str
    amount: float
    due_date: Optional[str] = None
    is_paid: bool
    paid_at: Optional[datetime] = None
    created_at: datetime

class StatsOut(BaseModel):
    total_income: float
    total_expense: float
    balance: float

# --- ARAÇLAR ---
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

security = HTTPBearer(auto_error=False)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(401, "Oturum açmanız gerekiyor")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload["sub"]
    except:
        raise HTTPException(401, "Geçersiz token")
    
    user = await User.get(uid)
    if not user:
        raise HTTPException(401, "Kullanıcı bulunamadı")
    return user

# --- UYGULAMA ---
app = FastAPI(title="Muhasebecim API 2026")

# CORS AYARI: Vercel'den gelen tüm istekleri kabul etmesini sağlar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.on_event("startup")
async def startup():
    client = AsyncIOMotorClient(MONGODB_URL)
    # Veritabanı ismini "muhasebe_db" olarak sabitledik
    db = client.get_database("muhasebe_db")
    await init_beanie(database=db, document_models=[User, Transaction, Bill])

@app.get("/api/health")
def health():
    return {"status": "ok", "db": "mongodb_atlas"}

# --- ENDPOINTS ---
@app.post("/api/register", response_model=TokenOut)
async def register(body: AuthBody):
    if await User.find_one(User.email == body.email):
        raise HTTPException(400, "Bu e-posta adresi zaten kayıtlı")
    u = User(email=body.email, password_hash=hash_password(body.password))
    await u.insert()
    return TokenOut(token=create_access_token(str(u.id)), email=u.email)

@app.post("/api/login", response_model=TokenOut)
async def login(body: AuthBody):
    u = await User.find_one(User.email == body.email)
    if not u or u.password_hash != hash_password(body.password):
        raise HTTPException(401, "Hatalı e-posta veya şifre")
    return TokenOut(token=create_access_token(str(u.id)), email=u.email)

@app.get("/api/stats", response_model=StatsOut)
async def get_stats(me: User = Depends(get_current_user)):
    txs = await Transaction.find(Transaction.user_id == str(me.id)).to_list()
    income = sum(t.amount for t in txs if t.type == "income")
    expense = sum(t.amount for t in txs if t.type == "expense")
    return StatsOut(total_income=income, total_expense=expense, balance=income - expense)

@app.post("/api/transactions", response_model=TxOut)
async def create_tx(body: TxCreate, me: User = Depends(get_current_user)):
    tx = Transaction(user_id=str(me.id), title=body.title.strip(), amount=body.amount, type=body.type)
    await tx.insert()
    return tx

@app.get("/api/transactions", response_model=List[TxOut])
async def list_tx(me: User = Depends(get_current_user), q: Optional[str] = Query(None), type: Optional[str] = Query(None)):
    query = Transaction.find(Transaction.user_id == str(me.id))
    if q: query = query.find({"title": {"$regex": q, "$options": "i"}})
    if type: query = query.find(Transaction.type == type)
    return await query.sort(-Transaction.created_at).to_list()

@app.delete("/api/transactions/{tx_id}")
async def delete_tx(tx_id: str, me: User = Depends(get_current_user)):
    tx = await Transaction.get(tx_id)
    if not tx or tx.user_id != str(me.id): raise HTTPException(404, "İşlem bulunamadı")
    await tx.delete()
    return {"ok": True}

@app.post("/api/bills", response_model=BillOut)
async def create_bill(body: BillCreate, me: User = Depends(get_current_user)):
    b = Bill(user_id=str(me.id), title=body.title.strip(), amount=body.amount, due_date=body.due_date)
    await b.insert()
    return b

@app.get("/api/bills", response_model=List[BillOut])
async def list_bills(me: User = Depends(get_current_user)):
    return await Bill.find(Bill.user_id == str(me.id)).sort(-Bill.created_at).to_list()

@app.patch("/api/bills/{bill_id}/paid", response_model=BillOut)
async def set_bill_paid(bill_id: str, body: dict, me: User = Depends(get_current_user)):
    b = await Bill.get(bill_id)
    if not b or b.user_id != str(me.id): raise HTTPException(404, "Fatura bulunamadı")
    
    paid_status = body.get("paid", False)
    if paid_status and not b.is_paid:
        b.is_paid = True
        b.paid_at = datetime.now(timezone.utc)
        tx = Transaction(
            user_id=str(me.id), title=f"Fatura Ödemesi: {b.title}", 
            amount=b.amount, type="expense", source="bill", source_id=str(b.id)
        )
        await tx.insert()
    elif not paid_status and b.is_paid:
        b.is_paid = False
        b.paid_at = None
        await Transaction.find(Transaction.source == "bill", Transaction.source_id == str(b.id)).delete()
    
    await b.save()
    return b

@app.delete("/api/bills/{bill_id}")
async def delete_bill(bill_id: str, me: User = Depends(get_current_user)):
    b = await Bill.get(bill_id)
    if not b or b.user_id != str(me.id): raise HTTPException(404, "Fatura bulunamadı")
    await Transaction.find(Transaction.source == "bill", Transaction.source_id == str(b.id)).delete()
    await b.delete()
    return {"ok": True}