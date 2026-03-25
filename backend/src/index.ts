import app from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(`Researcher Mapper backend running on http://localhost:${env.PORT}`);
});
