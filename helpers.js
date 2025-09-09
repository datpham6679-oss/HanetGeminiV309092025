import moment from 'moment-timezone';

// Chuẩn hóa chuỗi ngày tháng, chuyển định dạng bất kỳ sang 'YYYY-MM-DD HH:mm:ss'
export const normalizeDateString = (dateStr) => {
    if (!dateStr) return null;
    let m = moment(dateStr);
    return m.isValid() ? m.tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss') : null;
};

// Chuyển đổi timestamp sang chuỗi ngày tháng ở múi giờ Việt Nam
export const epochToVNString = (epoch) => {
    if (!epoch) return null;
    let m = moment.unix(epoch);
    return m.isValid() ? m.tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss') : null;
};

// Phân tích chuỗi ngày tháng thành các phần: timestamp, giờ và ngày
export const buildTimes = (vnFull) => {
    const tsVN = moment(vnFull).format('YYYY-MM-DD HH:mm:ss');
    const hmsVN = moment(vnFull).format('HH:mm:ss');
    const dmyVN = moment(vnFull).format('DD/MM/YYYY');
    return { tsVN, hmsVN, dmyVN };
};

// Xác định loại sự kiện (vào, ra, hoặc không xác định) dựa trên tên thiết bị
export const resolveEventType = (deviceName) => {
    const device = deviceName.toLowerCase();
    // Kiểm tra các từ khóa ở cuối tên thiết bị để xác định loại sự kiện chính xác hơn.
    if (device.endsWith('_vào') || device.endsWith('_in')) return 'vào';
    if (device.endsWith('_ra') || device.endsWith('_out')) return 'ra';
    return 'không xác định';
};
