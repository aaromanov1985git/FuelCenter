from app.database import SessionLocal
from app.models import Notification
db = SessionLocal()
count = db.query(Notification).count()
print(f'Total notifications: {count}')
if count > 0:
    n = db.query(Notification).first()
    print(f'Sample: id={n.id}, user={n.user_id}, title={n.title[:50]}')
db.close()

