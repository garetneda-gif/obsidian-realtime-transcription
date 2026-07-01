import os
import tempfile


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["BS_DATABASE_URL"] = f"sqlite:///{tmp}/billing.db"
        os.environ["BS_SECRET_KEY"] = "self-check-secret-with-enough-length"

        from app import create_app
        from database import SessionLocal, init_db
        from models import Order

        init_db()
        client = create_app().test_client()

        email = "paid@example.com"
        password = "password123"

        reg = client.post("/api/auth/register", json={"email": email, "password": password})
        assert reg.status_code == 201, reg.get_data(as_text=True)
        token = reg.get_json()["token"]

        login = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.get_data(as_text=True)

        order = client.post(
            "/api/billing/create-order",
            json={"amount": "9.90"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert order.status_code == 503, order.get_data(as_text=True)

        db = SessionLocal()
        try:
            assert db.query(Order).count() == 0
        finally:
            db.close()

    print("billing-server self-check ok")


if __name__ == "__main__":
    main()
