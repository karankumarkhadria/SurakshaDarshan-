import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import os
from pathlib import Path

try:
    import psycopg2
except ImportError:
    psycopg2 = None

BASE_DIR = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

# ---------------- APP SETUP ---------------- #

app = FastAPI(title="Visitor Prediction API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGIN",
        "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "ok", "message": "Visitor Prediction API is running"}

# ---------------- LOAD MODELS & DATA ---------------- #

blended_model = joblib.load(BASE_DIR / "models" / "blended_model.pkl")
scaler = joblib.load(BASE_DIR / "models" / "scaler.pkl")

df_hist = pd.read_csv(BASE_DIR / "test_clean_encoded_2.csv")
df_hist["date"] = pd.to_datetime(df_hist["date"])

festival_encoding = {
    "None": 0,
    "Diwali": 1,
    "Holi": 2,
    "Janmashtami": 3,
    "Makar Sakranti": 4,
    "Makar Sankranti": 4,
    "Makara Sankranti": 4,
    "Pongal": 4,
    "MahaShivratri": 5,
    "Maha Shivratri": 5,
    "Maha Shivaratri": 5,
    "Navratri": 6,
}

# ---------------- DATABASE CONFIG ---------------- #

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "database": os.getenv("POSTGRES_DB", "suraksha_darshan"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", ""),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
}

# ---------------- INPUT SCHEMA ---------------- #

class UserInput(BaseModel):
    date: str
    temperature: float
    precipitation: float
    festival: str
    temple_name: str
    day_of_week: int
    is_weekend: int
    festival_flag: int
    public_holiday: int

# ---------------- FEATURE ENGINEERING ---------------- #

def feature_engineer(user_row: pd.DataFrame):
    input_date = user_row["date"].iloc[0]

    hist_before = df_hist[df_hist["date"] < input_date]
    recent_visitors = (
        hist_before.iloc[-1]["visitor_count"]
        if len(hist_before) > 0
        else 45000
    )

    user_row["visitor_count"] = recent_visitors
    user_row["festival_name"] = festival_encoding.get(
        user_row["festival"].iloc[0], 0
    )

    user_row["temp_avg_c"] = user_row["temperature"]
    user_row["precipitation_mm"] = user_row["precipitation"]
    user_row["temple_name"] = 0

    df_ext = pd.concat([df_hist, user_row], ignore_index=True)

    df_ext["month"] = df_ext["date"].dt.month
    df_ext["day_of_year"] = df_ext["date"].dt.dayofyear
    df_ext["year"] = df_ext["date"].dt.year
    df_ext["weekofyear"] = df_ext["date"].dt.isocalendar().week.astype(int)

    df_ext["sin_dow"] = np.sin(2 * np.pi * df_ext["day_of_week"] / 7)
    df_ext["cos_dow"] = np.cos(2 * np.pi * df_ext["day_of_week"] / 7)
    df_ext["sin_month"] = np.sin(2 * np.pi * df_ext["month"] / 12)
    df_ext["cos_month"] = np.cos(2 * np.pi * df_ext["month"] / 12)
    df_ext["sin_year"] = np.sin(2 * np.pi * df_ext["day_of_year"] / 365.25)
    df_ext["cos_year"] = np.cos(2 * np.pi * df_ext["day_of_year"] / 365.25)

    for lag in [1, 2, 3, 7, 14, 30, 60]:
        df_ext[f"lag_{lag}"] = df_ext["visitor_count"].shift(lag)

    for win in [7, 14, 30]:
        df_ext[f"roll_mean_{win}"] = (
            df_ext["visitor_count"].shift(1).rolling(win).mean()
        )
        df_ext[f"roll_std_{win}"] = (
            df_ext["visitor_count"].shift(1).rolling(win).std()
        )

    df_ext["ema_7"] = df_ext["visitor_count"].shift(1).ewm(span=7).mean()
    df_ext["ema_30"] = df_ext["visitor_count"].shift(1).ewm(span=30).mean()

    final = df_ext.iloc[-1:].copy()
    final = final.ffill().fillna(0).infer_objects(copy=False)

    feature_cols = [
        "day_of_week", "is_weekend", "festival_flag", "festival_name",
        "public_holiday", "temp_avg_c", "precipitation_mm", "month",
        "day_of_year", "year", "weekofyear", "sin_dow", "cos_dow",
        "sin_month", "cos_month", "sin_year", "cos_year",
        "lag_1", "lag_2", "lag_3", "lag_7", "lag_14", "lag_30", "lag_60",
        "roll_mean_7", "roll_std_7", "roll_mean_14", "roll_std_14",
        "roll_mean_30", "roll_std_30", "ema_7", "ema_30",
    ]

    X = final[feature_cols]
    X_scaled = scaler.transform(X)

    return X_scaled, final

# ---------------- DATABASE SAVE ---------------- #

def save_to_database(final_row: pd.DataFrame):
    print(">>> SAVE_TO_DATABASE CALLED")

    if psycopg2 is None:
        print("DB SKIPPED: psycopg2 is not installed")
        return

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        row = final_row.iloc[0]

        cur.execute(
            """
            INSERT INTO real_world_data
            (date, temperature, precipitation, festival,
             temple_name, day_of_week, is_weekend,
             festival_flag, public_holiday, visitor_count)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                row["date"].to_pydatetime(),
                float(row["temp_avg_c"]),
                float(row["precipitation_mm"]),
                int(row["festival_name"]),
                0,
                int(row["day_of_week"]),
                int(row["is_weekend"]),
                int(row["festival_flag"]),
                int(row["public_holiday"]),
                int(row["visitor_count"]),
            ),
        )

        conn.commit()
        cur.close()
        conn.close()

        print(">>> DB INSERT COMMITTED")

    except Exception as e:
        print("DB ERROR:", e)

# ---------------- PREDICTION ---------------- #

def blended_predict(models_dict, X):
    cat_pred = models_dict["cat"].predict(X)[0]
    lgb_pred = models_dict["lgb"].predict(X)[0]
    weight = models_dict["weight"]
    return cat_pred * weight + lgb_pred * (1 - weight)

@app.post("/predict")
def predict(data: UserInput):
    try:
        user_df = pd.DataFrame([data.model_dump()])
        user_df["date"] = pd.to_datetime(user_df["date"])

        X_scaled, final_row = feature_engineer(user_df)
        save_to_database(final_row)

        prediction = blended_predict(blended_model, X_scaled)

        return {
            "status": "success",
            "predicted_visitors": int(prediction),
            "date": data.date,
        }

    except Exception as e:
        return {"status": "failed", "error": str(e)}

# ---------------- HEALTH ---------------- #

@app.get("/health")
def health_check():
    return {"status": "healthy", "rows_hist": len(df_hist)}

# ---------------- RUN ---------------- #

if __name__ == "__main__":
    print("Running on http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)
