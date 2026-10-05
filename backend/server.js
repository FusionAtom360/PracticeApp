import { createApp, config } from './src/app.js';

const app = await createApp();
app.listen(config.port, '0.0.0.0', () => {
    console.log(`PracticeApp backend listening on port ${config.port}`);
});
