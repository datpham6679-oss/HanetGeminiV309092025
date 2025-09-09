import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import hanetRoutes from './modules/routes.js';
import { poolPromise } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 1888;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*', limit: '2mb' }));



// Sử dụng các route đã định nghĩa
app.use('/', hanetRoutes);

// Bắt đầu server
app.listen(PORT, async () => {
    try {
        await poolPromise;
        console.log(`🚀 Server đang lắng nghe tại http://localhost:${PORT}`);
        console.log(`📩 Đang chờ dữ liệu Hanet tại http://localhost:${PORT}/hanet-webhook`);
    } catch (err) {
        console.error('❌ Server không thể kết nối tới cơ sở dữ liệu:', err);
    }
});

//sao lưu đưa lên github lúc 3:41PM 09092025