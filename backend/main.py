import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Annotated

import jwt
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, ConfigDict, BeforeValidator, computed_field
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import Document, init_beanie, Indexed
from bson import ObjectId

# --- AYARLAR ---
MONGODB_URL = os.environ.get("MONGODB_URL", "mongodb+srv://admin:Goldpony1234@cluster0.s9m6bix.mongodb.net/muhasebe_db?retryWrites=true&w=majority")
SECRET_KEY = "UMUT_SECRET_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# --- ÖZEL TİP ---
PyObjectId = Annotated[str, BeforeValidator(str)]

# --- MODELLER ---
class User(Document):
    email: Indexed(str, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    class Settings: name = "users"

class Transaction(Document):
    user_id: str
    title: str
    amount: float
    type: str 
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: Optional[str] = None
    source_id: Optional[str] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None
    class Settings: name = "transactions"

class Bill(Document):
    user_id: str
    title: str
    amount: float
    due_date: Optional[str] = None
    is_paid: bool = False
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    class Settings: name = "bills"

# --- ŞEMALAR ---
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
    payment_method: Optional[str] = None
    description: Optional[str] = None

class TxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: PyObjectId = Field(alias="_id")
    title: str
    amount: float
    type: str
    created_at: datetime
    source: Optional[str] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None

    @computed_field(alias="_id")
    @property
    def underscore_id(self) -> str: return str(self.id)

class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: PyObjectId = Field(alias="_id")
    title: str
    amount: float
    due_date: Optional[str] = None
    is_paid: bool
    paid_at: Optional[datetime] = None
    created_at: datetime

    @computed_field(alias="_id")
    @property
    def underscore_id(self) -> str: return str(self.id)

class StatsOut(BaseModel):
    total_income: float
    total_expense: float
    balance: float

# --- ARAÇLAR ---
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

security = HTTPBearer()

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user = await User.get(payload["sub"])
        if user: return user
    except: pass
    raise HTTPException(401, "Oturum geçersiz")

# --- UYGULAMA ---
app = FastAPI(title="Muhasebecim API 2026")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    client = AsyncIOMotorClient(MONGODB_URL)
    await init_beanie(database=client.get_database("muhasebe_db"), document_models=[User, Transaction, Bill])

# --- ENDPOINTS ---
@app.post("/api/register", response_model=TokenOut)
async def register(body: AuthBody):
    if await User.find_one(User.email == body.email): raise HTTPException(400, "E-posta kayıtlı")
    u = User(email=body.email, password_hash=hash_password(body.password))
    await u.insert()
    return TokenOut(token=create_access_token(str(u.id)), email=u.email)

@app.post("/api/login", response_model=TokenOut)
async def login(body: AuthBody):
    u = await User.find_one(User.email == body.email, User.password_hash == hash_password(body.password))
    if not u: raise HTTPException(401, "Hatalı giriş")
    return TokenOut(token=create_access_token(str(u.id)), email=u.email)

@app.get("/api/stats", response_model=StatsOut)
async def get_stats(me: User = Depends(get_current_user)):
    txs = await Transaction.find(Transaction.user_id == str(me.id)).to_list()
    inc = sum(t.amount for t in txs if t.type == "income")
    exp = sum(t.amount for t in txs if t.type == "expense")
    return StatsOut(total_income=inc, total_expense=exp, balance=inc - exp)

@app.get("/api/transactions", response_model=List[TxOut])
async def list_tx(me: User = Depends(get_current_user), q: str = None, start_date: str = None, end_date: str = None):
    query = Transaction.find(Transaction.user_id == str(me.id))
    if q: query = query.find({"title": {"$regex": q, "$options": "i"}})
    if start_date and end_date:
        s = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(hour=23, minute=59, second=59)
        query = query.find({"created_at": {"$gte": s, "$lte": e}})
    return await query.sort(-Transaction.created_at).to_list()

@app.post("/api/transactions", response_model=TxOut)
async def create_tx(body: TxCreate, me: User = Depends(get_current_user)):
    tx = Transaction(user_id=str(me.id), **body.dict())
    await tx.insert()
    return tx

@app.delete("/api/transactions/{tx_id}")
async def delete_tx(tx_id: str, me: User = Depends(get_current_user)):
    # GARANTİ SİLME: Hem Beanie hem manuel MongoDB ObjectId kontrolü
    try:
        target_id = ObjectId(tx_id) if ObjectId.is_valid(tx_id) else tx_id
        tx = await Transaction.find_one({"_id": target_id, "user_id": str(me.id)})
        if not tx: # String olarak tekrar dene
            tx = await Transaction.find_one({"_id": tx_id, "user_id": str(me.id)})
    except:
        tx = await Transaction.find_one(Transaction.id == tx_id, Transaction.user_id == str(me.id))
    
    if not tx: raise HTTPException(404, "Kayıt bulunamadı")
    await tx.delete()
    return {"ok": True}

@app.post("/api/bills", response_model=BillOut)
async def create_bill(body: dict, me: User = Depends(get_current_user)):
    b = Bill(user_id=str(me.id), title=body['title'], amount=body['amount'], due_date=body.get('due_date'))
    await b.insert()
    return b

@app.get("/api/bills", response_model=List[BillOut])
async def list_bills(me: User = Depends(get_current_user)):
    return await Bill.find(Bill.user_id == str(me.id)).sort(-Bill.created_at).to_list()

@app.patch("/api/bills/{bill_id}/paid", response_model=BillOut)
async def set_bill_paid(bill_id: str, body: dict, me: User = Depends(get_current_user)):
    b = await Bill.get(bill_id)
    if not b or b.user_id != str(me.id): raise HTTPException(404, "Yok")
    if body.get("paid") and not b.is_paid:
        b.is_paid = True
        b.paid_at = datetime.now(timezone.utc)
        await Transaction(user_id=str(me.id), title=f"Ödeme: {b.title}", amount=b.amount, type="expense", source="bill", source_id=str(b.id)).insert()
    elif not body.get("paid") and b.is_paid:
        b.is_paid = False
        await Transaction.find(Transaction.source == "bill", Transaction.source_id == str(b.id)).delete()
    await b.save()
    return b