import json
import requests
import asyncio
from typing import AsyncGenerator, Optional
from huggingface_hub import snapshot_download
from tqdm import tqdm
from typing import Any


class ProgressTqdm(tqdm):
    """
    A custom tqdm wrapper that puts progress updates into a queue.
    """

    def __init__(
        self,
        *args,
        queue: Optional[asyncio.Queue] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._queue = queue
        self._loop = loop

    def update(self, n=1):
        super().update(n)
        if self._queue and self._loop:
            # Calculate percentage if total is known
            if self.total:
                progress = (self.n / self.total) * 100
                asyncio.run_coroutine_threadsafe(
                    self._queue.put(
                        {
                            "status": "downloading",
                            "progress": round(progress, 1),
                            "model": self.desc,
                        }
                    ),
                    self._loop,
                )


async def stream_ollama_download(
    model_name: str, base_url: str
) -> AsyncGenerator[str, None]:
    """
    Streams progress from Ollama's pull API.
    """
    url = f"{base_url}/api/pull"
    payload = {"name": model_name, "stream": True}

    try:
        response = requests.post(url, json=payload, stream=True)
        for line in response.iter_lines():
            if line:
                data = json.loads(line)
                # Ollama returns completed/total
                if "total" in data and data["total"] > 0:
                    data["progress"] = round(
                        (data.get("completed", 0) / data["total"]) * 100, 1
                    )
                yield f"data: {json.dumps(data)}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def stream_hf_download(model_name: str) -> AsyncGenerator[str, None]:
    """
    Streams progress from Hugging Face snapshot_download.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def check_dimension():
        try:
            from langchain_huggingface import HuggingFaceEmbeddings
            from backend.services.embeddings import SUPPORTED_DIMS

            # Load model briefly to check dim
            model = HuggingFaceEmbeddings(model_name=model_name)
            client = getattr(model, "client", getattr(model, "_client", None))
            if client is None:
                await queue.put(
                    {
                        "error": "Could not access the underlying SentenceTransformer client."
                    }
                )
                return False

            dim = client.get_sentence_embedding_dimension()

            if dim not in SUPPORTED_DIMS:
                await queue.put(
                    {
                        "error": f"Model '{model_name}' has {dim} dimensions, which is not supported. "
                        f"Please use a model with {', '.join(map(str, SUPPORTED_DIMS))} dimensions."
                    }
                )
                return False
            return True
        except Exception as e:
            await queue.put({"error": f"Failed to verify model dimension: {str(e)}"})
            return False

    def run_download():
        try:
            snapshot_download(
                repo_id=model_name,
                tqdm_class=lambda *args, **kwargs: ProgressTqdm(
                    *args, queue=queue, loop=loop, **kwargs
                ),
            )

            # After download, check dimension
            async def verify_and_finish():
                if await check_dimension():
                    await queue.put({"status": "success", "progress": 100})

            asyncio.run_coroutine_threadsafe(verify_and_finish(), loop)

        except Exception as e:
            asyncio.run_coroutine_threadsafe(queue.put({"error": str(e)}), loop)

    # Run the blocking SF download in a thread
    loop.run_in_executor(None, run_download)

    while True:
        update = await queue.get()
        yield f"data: {json.dumps(update)}\n\n"
        if "status" in update and update["status"] == "success":
            break
        if "error" in update:
            break
