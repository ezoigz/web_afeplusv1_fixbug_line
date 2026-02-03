import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

// POST: บันทึกตำแหน่งผู้ดูแล, GET: ดึงตำแหน่งล่าสุดของผู้ดูแล
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            const { users_id, takecare_id, latitude, longitude, battery, location_id } = req.body;
            if (
                users_id === undefined ||
                takecare_id === undefined ||
                latitude === undefined ||
                longitude === undefined
            ) {
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ไม่ครบถ้วน' });
            }
            // สร้าง record ใหม่ใน dlocation
            const saved = await prisma.dlocation.create({
                data: {
                    users_id: Number(users_id),
                    takecare_id: Number(takecare_id),
                    locat_latitude: String(latitude),
                    locat_longitude: String(longitude),
                    locat_battery: battery ? Number(battery) : 0,
                    locat_status: 1,
                    locat_distance: 0,
                    locat_timestamp: new Date(),
                    location_id: location_id ? Number(location_id) : 0,
                },
            });
            return res.status(200).json({ message: 'success', data: saved });
        } catch (error) {
            return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการบันทึกตำแหน่งผู้ดูแล' });
        }
    } else if (req.method === 'GET') {
        try {
            const { users_id, takecare_id } = req.query;
            if (!users_id || !takecare_id) {
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ไม่ถูกต้อง' });
            }
            // ดึงตำแหน่งล่าสุดของผู้ดูแล
            const latest = await prisma.dlocation.findFirst({
                where: {
                    users_id: Number(users_id),
                    takecare_id: Number(takecare_id),
                },
                orderBy: { locat_timestamp: 'desc' },
            });
            if (!latest) {
                return res.status(404).json({ message: 'error', data: 'ไม่พบตำแหน่งผู้ดูแลล่าสุด' });
            }
            return res.status(200).json({ message: 'success', data: latest });
        } catch (error) {
            return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการดึงตำแหน่งผู้ดูแล' });
        }
    } else {
        res.setHeader('Allow', ['POST', 'GET']);
        res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
    }
}
