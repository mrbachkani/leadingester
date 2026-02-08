import IORedis from "ioredis";

async function test() {
  const url = "redis://127.0.0.1:6380";
  console.log(`Connecting to Redis at ${url}...`);
  
  const redis = new IORedis(url, { 
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      console.log(`Retry attempt ${times}`);
      return Math.min(times * 50, 2000);
    }
  });

  redis.on("error", (err) => {
    console.error("Redis Error Event:", err);
  });

  redis.on("connect", () => {
    console.log("Redis Connected!");
  });

  redis.on("ready", () => {
    console.log("Redis Ready!");
  });

  try {
    console.log("Sending PING...");
    const res = await redis.ping();
    console.log(`Redis PING response: ${res}`);
    
    await redis.quit();
    console.log("Redis connection closed.");
    process.exit(0);
  } catch (err) {
    console.error("Redis operation failed:", err);
    process.exit(1);
  }
}

test();
