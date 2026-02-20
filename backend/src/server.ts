import "dotenv/config";
import { env } from "./config/env"
import { app } from "./app";

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});