import asyncio
from redis.asyncio import Redis

async def main():
    r = Redis(
        host="localhost",
        port=6379,
        decode_responses=True
    )

    await r.set("ween:test", "ok")

    value = await r.get("ween:test")

    print(value)

    await r.aclose()

asyncio.run(main())