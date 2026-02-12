from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Literal

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import sessionmaker, declarative_base, Session, relationship

from passlib.context import CryptContext
from jose import jwt, JWTError

# ---------- CONFIG ----------
IST = timezone(timedelta(hours=3))

JWT_SECRET = "CHANGE_ME_SUPER_SECRET"
JWT_ALG = "HS256"
TOKEN_EXPIRE_DAYS = 30

# Kalıcı dosya: backend klasöründe esnaf_defteri.db
DATABASE_URL = "sqlite:///./esnaf_defteri.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------- DB MODELS ----------
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(IST))

    transactions = relationship("Transaction", back_populates="user")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String, nullable=False)  # income | expense

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(IST), index=True)

    user = relationship("User", back_populates="transactions")


Index("ix_transactions_user_created", Transaction.user_id, Transaction.created_at)

Base.metadata.create_all(bind=engine)


# ---------- SCHEMAS ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    token: str


class TxCreateIn(BaseModel):
    title: str
    amount: float
    type: Literal["income", "expense"]


class TxOut(BaseModel):
    id: int
    title: str
    amount: float
    type: Literal["income", "expense"]
    created_at: datetime


class SummaryOut(BaseModel):
    ana_kasa: float
    aylik_kasa: float
    month: str
    income_total: float
    expense_total: float


# ---------- UTILS ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return pwd_context.verify(pw, hashed)


def create_token(user_id: int) -> str:
    exp = datetime.now(IST) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def get_current_user_id(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
    token = authorization.replace("Bearer ", "").strip()

    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = int(data.get("sub"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user_id


# ---------- APP ----------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "Backend çalışıyor 🚀"}


# ---------- AUTH ----------
@app.post("/auth/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Bu email zaten kayıtlı")

    u = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"token": create_token(u.id)}


@app.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == payload.email).first()
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Hatalı email/şifre")
    return {"token": create_token(u.id)}


# ---------- TRANSACTIONS ----------
@app.post("/transactions", response_model=TxOut)
def create_tx(payload: TxCreateIn, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    tx = Transaction(
        user_id=user_id,
        title=payload.title.strip(),
        amount=float(payload.amount),
        type=payload.type,
        created_at=datetime.now(IST),  # ✅ otomatik tarih-saat
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return TxOut(id=tx.id, title=tx.title, amount=tx.amount, type=tx.type, created_at=tx.created_at)


@app.get("/transactions", response_model=List[TxOut])
def list_txs(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    start: Optional[str] = None,  # YYYY-MM-DD
    end: Optional[str] = None,    # YYYY-MM-DD
    limit: int = 500,
):
    q = db.query(Transaction).filter(Transaction.user_id == user_id)

    if start:
        s = datetime.fromisoformat(start).replace(tzinfo=IST)
        q = q.filter(Transaction.created_at >= s)
    if end:
        e = datetime.fromisoformat(end).replace(tzinfo=IST) + timedelta(days=1)
        q = q.filter(Transaction.created_at < e)

    items = q.order_by(Transaction.created_at.desc()).limit(limit).all()
    return [TxOut(id=t.id, title=t.title, amount=t.amount, type=t.type, created_at=t.created_at) for t in items]


@app.delete("/transactions/{tx_id}")
def delete_tx(tx_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == user_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    db.delete(tx)
    db.commit()
    return {"ok": True}


# ---------- SUMMARY ----------
@app.get("/summary", response_model=SummaryOut)
def summary(
    month: Optional[str] = None,  # YYYY-MM
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    all_txs = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    ana = 0.0
    for t in all_txs:
        ana += t.amount if t.type == "income" else -t.amount

    now = datetime.now(IST)
    if not month:
        month = now.strftime("%Y-%m")

    y, m = month.split("-")
    y = int(y)
    m = int(m)

    start_dt = datetime(y, m, 1, tzinfo=IST)
    end_dt = datetime(y + 1, 1, 1, tzinfo=IST) if m == 12 else datetime(y, m + 1, 1, tzinfo=IST)

    month_txs = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.created_at >= start_dt,
        Transaction.created_at < end_dt,
    ).all()

    income_total = 0.0
    expense_total = 0.0
    aylik = 0.0
    for t in month_txs:
        if t.type == "income":
            income_total += t.amount
            aylik += t.amount
        else:
            expense_total += t.amount
            aylik -= t.amount

    return SummaryOut(
        ana_kasa=round(ana, 2),
        aylik_kasa=round(aylik, 2),
        month=month,
        income_total=round(income_total, 2),
        expense_total=round(expense_total, 2),
    )
