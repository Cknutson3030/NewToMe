import "dotenv/config";
import { env } from "./config/env"
import { app } from "./app";

//There is no localhost access on Azure.
app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});