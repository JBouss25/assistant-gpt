from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://erpai:change_me@postgres-ai:5432/erp_ai"
    redis_url: str = "redis://:change_me@redis:6379/3"
    kafka_bootstrap_servers: str = "kafka:9092"
    kafka_group_id: str = "ai-prediction-service"
    model_path: str = "/app/models/dropout_model.joblib"
    risk_threshold_high: float = 0.7
    risk_threshold_medium: float = 0.4
    jwt_public_key: str = ""
    log_level: str = "info"

    class Config:
        env_file = ".env"


settings = Settings()
