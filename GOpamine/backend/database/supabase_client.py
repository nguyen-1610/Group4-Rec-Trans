import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load .env
current_dir = Path(__file__).resolve()  # backend/database
root_dir = current_dir.parent.parent           # Root của dự án
env_path = root_dir / 'routes' / '.env'

# Load file .env với đường dẫn cụ thể
load_dotenv(dotenv_path=env_path)
# --------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")



if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("❌ Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong .env")

# Tạo client dùng chung cho cả dự án
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)



def test_connection():
	"""
	Quick check to confirm connection to Supabase works.
	It fetches 1 row from any lightweight table (e.g., 'users').
	You can modify the table name if needed.
	"""
	try:
		response = supabase.table("users").select("user_id").limit(1).execute()
		return True, response.data
	except Exception as e:
		return False, str(e)

ok, msg = test_connection()
print(ok, msg)

__all__ = ["supabase", "test_connection"]