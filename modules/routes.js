import express from 'express';
import qs from 'querystring';
import ExcelJS from 'exceljs';
import { sql, poolPromise } from '../db.js';
import * as helpers from '../helpers.js';
import moment from 'moment-timezone';

const router = express.Router();

router.post('/hanet-webhook', async (req, res) => {
    let p = req.body;
    
    if (!p || typeof p !== 'object' || Object.keys(p).length === 0) {
        try {
            const rawBody = req.body.toString('utf8');
            p = qs.parse(rawBody);
            if (p.payload) p = JSON.parse(p.payload);
            else if (p.data) p = JSON.parse(p.data);
            else {
                console.error("❌ Payload rỗng hoặc không đúng định dạng. Raw body:", rawBody);
                return res.status(400).json({ error: 'Invalid payload' });
            }
        } catch (e) {
            console.error("❌ Lỗi phân tích payload:", e.message);
            return res.status(400).json({ error: 'Invalid payload' });
        }
    }

    const vnFull = helpers.normalizeDateString(p.date) || helpers.epochToVNString(p.time);
    const { tsVN, hmsVN, dmyVN } = helpers.buildTimes(vnFull);

    const type = helpers.resolveEventType(p.deviceName);
    const empName = p.personName || '-';
    const deviceName = p.deviceName || '-';
    const deviceId = p.deviceID || '-';
    const eventId = p.id || `${Date.now()}-${Math.random()}`;

    try {
        const pool = await poolPromise;
        const request = await pool.request();

        request.input('event_id', sql.NVarChar(100), eventId);
        request.input('employee_code', sql.NVarChar(50), p.employee_code || null);
        request.input('person_id', sql.NVarChar(50), p.personID || null);
        request.input('employee_name', sql.NVarChar(200), empName);
        request.input('device_id', sql.NVarChar(100), deviceId);
        request.input('device_name', sql.NVarChar(200), deviceName);
        request.input('event_type', sql.NVarChar(20), type);
        request.input('ts_vn', sql.NVarChar(19), tsVN);
        request.input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify(p));

        await request.query(`
            MERGE dbo.hanet_events_raw AS tgt
            USING (SELECT
                @event_id AS event_id,
                @employee_code AS employee_code,
                @person_id AS person_id,
                @employee_name AS employee_name,
                @device_id AS device_id,
                @device_name AS device_name,
                @event_type AS event_type,
                CONVERT(datetime2(0), @ts_vn, 120) AS ts_vn,
                @payload_json AS payload_json
            ) AS src
            ON tgt.event_id = src.event_id
            WHEN NOT MATCHED THEN
                INSERT (event_id, employee_code, person_id, employee_name, device_id, device_name, event_type, ts_vn, payload_json, DaXuLy)
                VALUES (src.event_id, src.employee_code, src.person_id, src.employee_name, src.device_id, src.device_name, src.event_type, src.ts_vn, src.payload_json, 0);
        `);

        await request.query(`EXEC sp_XuLyChamCongMoi`);
        await request.query(`EXEC sp_XuLyChamCong_VH`);
        
    } catch (e) {
        console.error('❌ Lỗi lưu SQL:', e.message);
        return res.status(500).json({ error: 'Database error' });
    }
    
    console.log(`📌 [${type}] ${hmsVN} (VN)`);
    console.log(`👤 Nhân viên : ${empName}`);
    console.log(`🏢 Thiết bị : ${deviceName} (ID=${deviceId})`);
    console.log(`Thời gian: ${hmsVN} ${dmyVN}`);

    return res.status(200).json({ ok: true });
});

router.post('/add-employee', async (req, res) => {
    try {
        const { maNhanVien, hoTen, phongBan, chucVu } = req.body;
        
        if (!maNhanVien || !hoTen) {
            return res.status(400).json({ error: 'Mã nhân viên và Họ tên là bắt buộc.' });
        }

        const pool = await poolPromise;
        const request = pool.request();

        const query = `
            MERGE NhanVien AS target
            USING (VALUES (@maNhanVien, @hoTen, @phongBan, @chucVu)) AS source (MaNhanVienNoiBo, HoTen, PhongBan, ChucVu)
            ON target.MaNhanVienNoiBo = source.MaNhanVienNoiBo
            WHEN NOT MATCHED THEN
                INSERT (MaNhanVienNoiBo, HoTen, PhongBan, ChucVu)
                VALUES (source.MaNhanVienNoiBo, source.HoTen, source.PhongBan, source.ChucVu)
            WHEN MATCHED THEN
                UPDATE SET
                    target.HoTen = source.HoTen,
                    target.PhongBan = source.PhongBan,
                    target.ChucVu = source.ChucVu;
        `;

        request.input('maNhanVien', sql.NVarChar(50), maNhanVien);
        request.input('hoTen', sql.NVarChar(200), hoTen);
        request.input('phongBan', sql.NVarChar(100), phongBan || null);
        request.input('chucVu', sql.NVarChar(100), chucVu || null);
        
        await request.query(query);

        res.status(200).json({ message: 'Thêm/cập nhật nhân viên thành công.' });

    } catch (err) {
        console.error('Lỗi SQL khi thêm nhân viên:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi thêm nhân viên.' });
    }
});

router.get('/departments', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT DISTINCT PhongBan FROM NhanVien WHERE PhongBan IS NOT NULL AND PhongBan != \'\' ORDER BY PhongBan;');
        const departments = result.recordset.map(row => row.PhongBan);
        res.json(departments);
    } catch (err) {
        console.error('SQL Server query error:', err);
        res.status(500).send('Lỗi máy chủ khi lấy danh sách phòng ban');
    }
});

router.get('/report/excel', async (req, res) => {
    try {
        const pool = await poolPromise;
        const request = await pool.request();

        const result = await request.query(`
            SELECT
                nv.MaNhanVienNoiBo,
                nv.HoTen,
                c.Ngay, 
                CONVERT(DATE, c.GioVao) AS NgayVao, 
                CONVERT(DATE, c.GioRa) AS NgayRa, 
                CONVERT(VARCHAR(8), c.GioVao, 108) AS GioVao,
                CONVERT(VARCHAR(8), c.GioRa, 108) AS GioRa,
                c.ThoiGianLamViec,
                c.TrangThai
            FROM ChamCongDaXuLyMoi AS c
            JOIN NhanVien AS nv ON c.MaNhanVienNoiBo = nv.MaNhanVienNoiBo
            ORDER BY c.Ngay DESC;
        `);

        const data = result.recordset;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Báo cáo chấm công');

        worksheet.columns = [
            { header: 'Mã Nhân Viên', key: 'MaNhanVienNoiBo', width: 20 },
            { header: 'Họ và tên', key: 'HoTen', width: 30 },
            { header: 'Ngày công', key: 'Ngay', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Ngày vào', key: 'NgayVao', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Ngày ra', key: 'NgayRa', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Giờ vào', key: 'GioVao', width: 15, style: { numFmt: '@' } },
            { header: 'Giờ ra', key: 'GioRa', width: 15, style: { numFmt: '@' } },
            { header: 'Thời gian làm việc (giờ)', key: 'ThoiGianLamViec', width: 25 },
            { header: 'Trạng thái', key: 'TrangThai', width: 25 }
        ];

        worksheet.addRows(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=bao_cao_cham_cong.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('SQL Server query or Excel generation error: ', err);
        res.status(500).send('Lỗi máy chủ khi tạo báo cáo');
    }
});

router.get('/attendance-data', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { startDate, endDate, personId, status, department } = req.query;

        let query = `
            SELECT
                nv.MaNhanVienNoiBo,
                nv.HoTen,
                c.Ngay,
                c.GioVao,
                c.GioRa,
                c.ThoiGianLamViec,
                c.TrangThai
            FROM ChamCongDaXuLyMoi AS c
            JOIN NhanVien AS nv ON c.MaNhanVienNoiBo = nv.MaNhanVienNoiBo
        `;

        const whereClauses = [];
        const request = await new sql.Request(pool);

        if (startDate) {
            whereClauses.push(`c.Ngay >= @startDate`);
            request.input('startDate', sql.Date, startDate);
        }

        if (endDate) {
            whereClauses.push(`c.Ngay <= @endDate`);
            request.input('endDate', sql.Date, endDate);
        }

        if (personId) {
            whereClauses.push(`nv.MaNhanVienNoiBo = @personId`);
            request.input('personId', sql.NVarChar(50), personId);
        }

        if (status) {
            whereClauses.push(`LTRIM(RTRIM(c.TrangThai)) = @status`);
            request.input('status', sql.NVarChar(50), status.trim());
        }

        if (department) {
            whereClauses.push(`nv.PhongBan = @department`);
            request.input('department', sql.NVarChar(100), department);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        query += ' ORDER BY c.Ngay DESC;';

        const result = await request.query(query);

        res.json(result.recordset);
    } catch (err) {
        console.error('SQL Server query error:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy dữ liệu' });
    }
});

export default router;