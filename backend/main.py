from fastapi import FastAPI, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, func
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from datetime import datetime, timedelta, timezone, date
import jwt
import hashlib
import os

# ================= DATABASE =================

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./esnaf_defteri.db")

# Heroku/Render vb bazen postgres:// verir
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

# ================= JWT =================

SECRET_KEY = os.getenv("JWT_SECRET", "UMUT_SECRET_2026")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

# ================= MODELS =================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)

    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String, nullable=False)  # income / expense

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user_id = Column(Integer, index=True, nullable=False)


Base.metadata.create_all(bind=engine)

# ================= SCHEMAS =================

class RegisterSchema(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=3)

class LoginSchema(BaseModel):
    email: str
    password: str

class TxSchema(BaseModel):
    title: str = Field(..., min_length=1)
    amount: float
    type: str  # income/expense

# ================= APP =================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # prod'da domain'e daraltırız
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

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"user_id": user_id, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).filter(User.id == payload.get("user_id")).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================= HELPERS =================

def parse_yyyy_mm_dd(s: str) -> datetime:
    # 2026-02-14 gibi
    try:
        d = datetime.strptime(s, "%Y-%m-%d").date()
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s}. Use YYYY-MM-DD")

def month_range(year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end

# ================= ROUTES =================

@app.get("/")
def root():
    return {"status": "Backend çalışıyor 🚀"}

@app.post("/auth/register")
def register(data: RegisterSchema, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="User exists")

    user = User(email=data.email, password=hash_password(data.password))
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
    if data.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="type must be 'income' or 'expense'")

    tx = Transaction(
        title=data.title.strip(),
        amount=float(data.amount),
        type=data.type,
        user_id=user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx

@app.get("/transactions")
def list_tx(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),

    # filtreler
    period: str | None = Query(default=None, description="daily|monthly"),
    from_date: str | None = Query(default=None, alias="from", description="YYYY-MM-DD"),
    to_date: str | None = Query(default=None, alias="to", description="YYYY-MM-DD"),
    q: str | None = Query(default=None, description="title search"),
    type: str | None = Query(default=None, description="income|expense"),
    min_amount: float | None = Query(default=None),
    max_amount: float | None = Query(default=None),

    # sayfalama
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    query = db.query(Transaction).filter(Transaction.user_id == user.id)

    # period hızlı filtre
    now = datetime.now(timezone.utc)
    if period == "daily":
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = query.filter(Transaction.created_at >= start, Transaction.created_at < end)
    elif period == "monthly":
        start, end = month_range(now.year, now.month)
        query = query.filter(Transaction.created_at >= start, Transaction.created_at < end)
    elif period is not None:
        raise HTTPException(status_code=400, detail="period must be daily or monthly")

    # özel aralık
    if from_date:
        start = parse_yyyy_mm_dd(from_date)
        query = query.filter(Transaction.created_at >= start)
    if to_date:
        end = parse_yyyy_mm_dd(to_date) + timedelta(days=1)  # günü dahil et
        query = query.filter(Transaction.created_at < end)

    # type
    if type:
        if type not in ("income", "expense"):
            raise HTTPException(status_code=400, detail="type must be income or expense")
        query = query.filter(Transaction.type == type)

    # arama
    if q:
        query = query.filter(Transaction.title.ilike(f"%{q.strip()}%"))

    # amount aralığı
    if min_amount is not None:
        query = query.filter(Transaction.amount >= float(min_amount))
    if max_amount is not None:
        query = query.filter(Transaction.amount <= float(max_amount))

    rows = (
        query.order_by(Transaction.created_at.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows

@app.delete("/transactions/{tx_id}")
def delete_tx(tx_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}

@app.get("/summary")
def summary(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
):
    """
    ana_kasa: tüm zaman net
    aylik_kasa: seçilen ay net (year/month verilmezse bu ay)
    """
    txs_all = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    income_all = sum(t.amount for t in txs_all if t.type == "income")
    expense_all = sum(t.amount for t in txs_all if t.type == "expense")
    ana_kasa = income_all - expense_all

    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    start, end = month_range(y, m)

    txs_month = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.created_at >= start, Transaction.created_at < end)
        .all()
    )
    income_m = sum(t.amount for t in txs_month if t.type == "income")
    expense_m = sum(t.amount for t in txs_month if t.type == "expense")
    aylik_kasa = income_m - expense_m

    return {
        "ana_kasa": ana_kasa,
        "income_total": income_all,
        "expense_total": expense_all,
        "aylik_kasa": aylik_kasa,
        "aylik_income_total": income_m,
        "aylik_expense_total": expense_m,
        "ay": f"{y:04d}-{m:02d}",
    }
