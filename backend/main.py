from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from datetime import datetime
import jwt
import hashlib
import os

# ================= DATABASE =================

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./esnaf_defteri.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# ================= JWT =================

SECRET_KEY = "UMUT_SECRET_2026"
ALGORITHM = "HS256"

# ================= MODELS =================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True)
    password = Column(String)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    amount = Column(Float)
    type = Column(String)  # income / expense
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer)

Base.metadata.create_all(bind=engine)

# ================= SCHEMAS =================

class RegisterSchema(BaseModel):
    email: str
    password: str

class LoginSchema(BaseModel):
    email: str
    password: str

class TxSchema(BaseModel):
    title: str
    amount: float
    type: str

# ================= APP =================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= DB DEP =================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ================= AUTH =================

def hash_password(pw: str):
    return hashlib.sha256(pw.encode()).hexdigest()

def create_token(user_id: int):
    return jwt.encode({"user_id": user_id}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).filter(User.id == payload["user_id"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================= ROUTES =================

@app.post("/auth/register")
def register(data: RegisterSchema, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="User exists")

    user = User(
        email=data.email,
        password=hash_password(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"token": create_token(user.id)}

@app.post("/auth/login")
def login(data: LoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or user.password != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Wrong credentials")

    return {"token": create_token(user.id)}

@app.post("/transactions")
def create_tx(data: TxSchema, user=Depends(get_current_user), db: Session = Depends(get_db)):
    tx = Transaction(
        title=data.title,
        amount=data.amount,
        type=data.type,
        user_id=user.id,
        created_at=datetime.utcnow()
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx

@app.get("/transactions")
def list_tx(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.id.desc()).all()

@app.delete("/transactions/{tx_id}")
def delete_tx(tx_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")

    db.delete(tx)
    db.commit()
    return {"ok": True}

@app.get("/summary")
def summary(user=Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).all()

    income = sum(t.amount for t in txs if t.type == "income")
    expense = sum(t.amount for t in txs if t.type == "expense")

    return {
        "ana_kasa": income - expense,
        "income_total": income,
        "expense_total": expense
    }

@app.get("/")
def root():
    return {"status": "Backend çalışıyor 🚀"}
