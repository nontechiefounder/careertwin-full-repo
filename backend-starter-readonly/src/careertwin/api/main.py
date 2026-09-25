from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from careertwin import __version__
from careertwin.api.routes.ai import router as ai_router
from careertwin.api.routes.documents import router as documents_router
from careertwin.api.routes.health import router as health_router
from careertwin.api.routes.roles import router as roles_router
from careertwin.api.routes.runs import router as runs_router


from careertwin.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_settings()
    yield


app = FastAPI(
    title="CareerTWiN Platform API",
    version=__version__,
    description=(
        "Evidence-first role and candidate trust engine. Use the Gemini AI testing endpoints with "
        "synthetic data only during development."
    ),
    lifespan=lifespan,
)
app.include_router(ai_router)
app.include_router(documents_router)
app.include_router(health_router)
app.include_router(roles_router)
app.include_router(runs_router)



@app.get("/", include_in_schema=False)
async def interactive_api() -> RedirectResponse:
    return RedirectResponse(url="/docs")
