from fastapi import APIRouter

router = APIRouter()


@router.get("/", tags=["health"])
async def read_root():
    return {"status": "ok", "service": "AI Schedule Manage"}
