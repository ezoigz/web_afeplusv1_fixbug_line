import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import _ from 'lodash';
import { replyNotificationPostbackfall } from '@/utils/apiLineReply';
import axios from 'axios';
import moment from 'moment';

const LINE_PUSH_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';
const LINE_HEADER = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN_LINE}`,
};

type Data = {
    message: string;
    data?: any;
};

const MAX_NOTIFY = 4;          // 🔔 แจ้งเตือนสูงสุดต่อการล้ม 1 รอบ
const RESET_MINUTES = 5;       // ⏱️ ครบกี่นาทีถือเป็นการล้มรอบใหม่

export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    if (req.method !== 'PUT' && req.method !== 'POST') {
        res.setHeader('Allow', ['PUT', 'POST']);
        return res
            .status(405)
            .json({ message: 'error', data: `วิธี ${req.method} ไม่อนุญาต` });
    }

    try {
        const body = req.body;

        // -------------------------
        // 1️⃣ Validate input
        // -------------------------
        if (
            body.users_id == null ||
            body.takecare_id == null ||
            body.x_axis == null ||
            body.y_axis == null ||
            body.z_axis == null ||
            body.fall_status == null ||
            body.latitude == null ||
            body.longitude == null
        ) {
            return res.status(400).json({
                message: 'error',
                data:
                    'Missing parameter: users_id, takecare_id, x_axis, y_axis, z_axis, fall_status, latitude, longitude',
            });
        }

        if (
            _.isNaN(Number(body.users_id)) ||
            _.isNaN(Number(body.takecare_id)) ||
            _.isNaN(Number(body.fall_status))
        ) {
            return res.status(400).json({
                message: 'error',
                data: 'users_id, takecare_id, fall_status ต้องเป็นตัวเลข',
            });
        }

        const fallStatus = Number(body.fall_status);

        // -------------------------
        // 2️⃣ Load user / takecare
        // -------------------------
        const user = await prisma.users.findFirst({
            where: { users_id: Number(body.users_id) },
        });

        const takecareperson = await prisma.takecareperson.findFirst({
            where: {
                takecare_id: Number(body.takecare_id),
                takecare_status: 1,
            },
        });

        if (!user || !takecareperson) {
            return res
                .status(200)
                .json({ message: 'error', data: 'ไม่พบข้อมูล user หรือ takecareperson' });
        }

        // -------------------------
        // 3️⃣ Load last fall record
        // -------------------------
        const lastFall = await prisma.fall_records.findFirst({
            where: {
                users_id: user.users_id,
                takecare_id: takecareperson.takecare_id,
            },
            orderBy: { noti_time: 'desc' },
        });

        let noti_status: number | null = 0;
        let noti_time: Date | null = null;
        let nextNotiCount = 0;

        const isFallEvent = fallStatus === 2 || fallStatus === 3;
        const isNewRound =
            !lastFall ||
            !lastFall.noti_time ||
            moment().diff(moment(lastFall.noti_time), 'minutes') >= RESET_MINUTES;

        // -------------------------
        // 4️⃣ Decide send LINE or not
        // -------------------------
        if (isFallEvent) {
            if (isNewRound) {
                nextNotiCount = 1;
            } else {
                nextNotiCount = (lastFall?.noti_count ?? 0) + 1;
            }

            if (nextNotiCount <= MAX_NOTIFY) {
                const message =
                    fallStatus === 2
                        ? `🚨 คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname} กด "ไม่โอเค" ขอความช่วยเหลือ`
                        : `🚨 คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname} ไม่มีการตอบสนองภายใน 30 วินาที`;

                const replyToken = user.users_line_id || '';

                if (replyToken) {
                    // 🔔 ส่งข้อความแจ้งเตือน
                    await replyNotificationPostbackfall({
                        replyToken,
                        userId: user.users_id,
                        takecarepersonId: takecareperson.takecare_id,
                        type: 'fall',
                        message,
                    });

                    // 📍 ส่ง location
                    await axios.post(
                        LINE_PUSH_MESSAGING_API,
                        {
                            to: replyToken,
                            messages: [
                                {
                                    type: 'location',
                                    title: 'ตำแหน่งที่ล้มล่าสุด',
                                    address: `ตำแหน่งของ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname}`,
                                    latitude: Number(body.latitude),
                                    longitude: Number(body.longitude),
                                },
                            ],
                        },
                        { headers: LINE_HEADER }
                    );
                }

                noti_status = 1;
                noti_time = new Date();
            } else {
                // เกิน 4 ครั้งแล้ว
                noti_status = 0;
                noti_time = null;
            }
        }

        // -------------------------
        // 5️⃣ Save fall record
        // -------------------------
        await prisma.fall_records.create({
            data: {
                users_id: user.users_id,
                takecare_id: takecareperson.takecare_id,
                x_axis: Number(body.x_axis),
                y_axis: Number(body.y_axis),
                z_axis: Number(body.z_axis),
                fall_latitude: body.latitude,
                fall_longitude: body.longitude,
                fall_status: fallStatus,
                noti_status: noti_status,
                noti_time: noti_time,
                noti_count: nextNotiCount,
            },
        });

        return res
            .status(200)
            .json({ message: 'success', data: 'บันทึกข้อมูลเรียบร้อย' });
    } catch (error) {
        console.error('API /sentFall error:', error);
        return res.status(400).json({ message: 'error', data: error });
    }
}
