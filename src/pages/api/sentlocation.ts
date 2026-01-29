import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { replyNotification, replyNotificationPostback } from '@/utils/apiLineReply';
import moment from 'moment';

export default async function handle(req: NextApiRequest, res: NextApiResponse) {

  // รองรับเฉพาะ POST / PUT
  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT', 'POST']);
    return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
  }

  try {
    const { uId, takecare_id, distance, latitude, longitude, battery } = req.body;

    // ===============================
    // 1️⃣ ตรวจสอบพารามิเตอร์
    // ใช้ === undefined เพื่อให้ค่า 0 ผ่านได้
    // ===============================
    if (
      uId === undefined ||
      takecare_id === undefined ||
      distance === undefined ||
      latitude === undefined ||
      longitude === undefined ||
      battery === undefined
    ) {
      return res.status(400).json({
        message: 'error',
        data: 'พารามิเตอร์ไม่ครบถ้วน',
      });
    }

    // ===============================
    // 2️⃣ ดึงข้อมูล Safezone
    // ===============================
    const safezone = await prisma.safezone.findFirst({
      where: {
        takecare_id: Number(takecare_id),
        users_id: Number(uId),
      },
    });

    if (!safezone) {
      return res.status(404).json({
        message: 'error',
        data: 'ไม่พบข้อมูล Safezone',
      });
    }

    const r1 = safezone.safez_radiuslv1;
    const r2 = safezone.safez_radiuslv2;
    const safezoneThreshold = r2 * 0.8;
    const distNum = Number(distance);

    // ===============================
    // 3️⃣ คำนวณสถานะ Safezone
    // 0 = ปกติ
    // 1 = ออกนอกเขต lv1
    // 3 = ใกล้ขอบ lv2
    // 2 = ออกนอกเขต lv2
    // ===============================
    let calculatedStatus = 0;

    if (distNum <= r1) {
      calculatedStatus = 0;
    } else if (distNum > r1 && distNum < safezoneThreshold) {
      calculatedStatus = 1;
    } else if (distNum >= safezoneThreshold && distNum <= r2) {
      calculatedStatus = 3;
    } else if (distNum > r2) {
      calculatedStatus = 2;
    }

    // ===============================
    // 4️⃣ หา record ล่าสุด (คู่ users_id + takecare_id)
    // เพื่อใช้ update ไม่ให้ข้อมูลแตกเป็นหลายแถว
    // ===============================
    const latest = await prisma.location.findFirst({
      where: {
        users_id: Number(uId),
        takecare_id: Number(takecare_id),
      },
      orderBy: {
        locat_timestamp: 'desc',
      },
    });

    // ===============================
    // 5️⃣ เตรียม payload สำหรับบันทึก
    // - locat_noti_status = 1 → มีการประเมินแจ้งเตือนแล้ว
    // - locat_noti_time → เวลาล่าสุดที่ประเมิน
    // ===============================
    const dataPayload = {
      users_id: Number(uId),
      takecare_id: Number(takecare_id),
      locat_timestamp: new Date(),
      locat_latitude: String(latitude),
      locat_longitude: String(longitude),
      locat_status: calculatedStatus,
      locat_distance: distNum,
      locat_battery: Number(battery),
      locat_noti_time: new Date(),
      locat_noti_status: 1, // ✅ มีค่า default แล้ว แต่ใส่ชัดเจน
    };

    // ===============================
    // 6️⃣ UPDATE หรือ CREATE
    // ❗ ต้องใช้ location_id เป็น where
    // เพราะ Prisma update ต้อง unique
    // ===============================
    let savedLocation;

    if (latest) {
      savedLocation = await prisma.location.update({
        where: {
          location_id: latest.location_id, // ✅ จุดสำคัญ
        },
        data: dataPayload,
      });
    } else {
      savedLocation = await prisma.location.create({
        data: dataPayload,
      });
    }

    // ===============================
    // 7️⃣ ถ้าสถานะปกติ → ไม่ต้องแจ้งเตือน
    // ===============================
    if (calculatedStatus === 0) {
      return res.status(200).json({
        message: 'success',
        data: savedLocation,
      });
    }

    // ===============================
    // 8️⃣ ดึงข้อมูลผู้ใช้ + ผู้ดูแล
    // ===============================
    const user = await prisma.users.findFirst({
      where: { users_id: Number(uId) },
    });

    const takecareperson = await prisma.takecareperson.findFirst({
      where: {
        users_id: Number(uId),
        takecare_id: Number(takecare_id),
        takecare_status: 1,
      },
    });

    if (!user || !takecareperson) {
      return res.status(200).json({
        message: 'success',
        data: savedLocation,
      });
    }

    const replyToken = user.users_line_id || '';

    // ===============================
    // 9️⃣ ส่งแจ้งเตือนตามสถานะ
    // ===============================
    if (replyToken) {
      if (calculatedStatus === 3) {
        await replyNotification({
          replyToken,
          message: `คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname}
เข้าใกล้เขตปลอดภัย ชั้นที่ 2 แล้ว`,
        });
      }

      if (calculatedStatus === 1) {
        await replyNotification({
          replyToken,
          message: `คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname}
ออกนอกเขตปลอดภัย ชั้นที่ 1 แล้ว`,
        });
      }

      if (calculatedStatus === 2) {
        await replyNotificationPostback({
          userId: Number(uId),
          takecarepersonId: Number(takecare_id),
          type: 'safezone',
          message: `คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname}
ออกนอกเขตปลอดภัย ชั้นที่ 2 แล้ว`,
          replyToken,
        });
      }
    }

    return res.status(200).json({
      message: 'success',
      data: savedLocation,
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      message: 'error',
      data: 'เกิดข้อผิดพลาดในการประมวลผล',
    });
  }
}
