import axios from 'axios';
import prisma from '@/lib/prisma';

// --- Configuration ---
const LINE_HEADER = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN_LINE}`,
};

const API = {
    PUSH: 'https://api.line.me/v2/bot/message/push',
    PROFILE: 'https://api.line.me/v2/bot/profile',
};

// --- Interfaces ---
interface ReplyNotification {
    resUser: {
        users_fname: string;
        users_sname: string;
        users_tel1: string;
        users_line_id: string;
    };
    resTakecareperson: {
        takecare_fname: string;
        takecare_sname: string;
        takecare_tel1: string;
        takecare_id: number;
    };
    extendedHelpId: number;
    locationData: {
        locat_latitude: number;
        locat_longitude: number;
    };
    retryCount?: number; // เพิ่มเพื่อรองรับการแจ้งเตือนครั้งที่ 2, 3...
}

// --- Helper Functions ---

/** ดึงข้อมูลโปรไฟล์ LINE ของผู้ใช้ */
export const getUserProfile = async (userId: string) => {
    try {
        const response = await axios.get(`${API.PROFILE}/${userId}`, { headers: LINE_HEADER });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching LINE profile:", error.response?.data || error.message);
        return { displayName: "ไม่ทราบชื่อ" };
    }
};

/** สร้างกล่องข้อมูลพื้นฐานใน Flex Message */
const createInfoRow = (label: string, text: string) => ({
    type: "box",
    layout: "baseline",
    contents: [
        { type: "text", text: label, flex: 2, size: "sm", color: "#AAAAAA" },
        { type: "text", text: text, flex: 5, size: "sm", color: "#666666", wrap: true }
    ]
});

// --- Main Functions ---

/** * ฟังก์ชันส่งแจ้งเตือนหลักเมื่อเกิดเหตุ 
 */
export const sendEmergencyNotification = async (data: ReplyNotification) => {
    const { resUser, resTakecareperson, extendedHelpId, locationData, retryCount } = data;
    const { locat_latitude: lat, locat_longitude: lon } = locationData;

    try {
        // 1. ค้นหากลุ่มไลน์ที่จะแจ้งเตือน
        const group = await prisma.groupLine.findFirst({ where: { group_status: 1 } });
        if (!group) throw new Error("ไม่พบกลุ่มไลน์ที่เปิดใช้งานในระบบ");

        const retryText = retryCount && retryCount > 1 ? ` (ครั้งที่ ${retryCount})` : "";
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

        // 2. เตรียมข้อมูลข้อความ (Array of messages)
        const messages = [
            // ข้อความที่ 1: พิกัดแผนที่ (ส่งแบบ Native Location ของ LINE)
            {
                type: 'location',
                title: `พิกัด: ${resTakecareperson.takecare_fname}`,
                address: 'ตำแหน่งที่เกิดเหตุล้ม',
                latitude: lat,
                longitude: lon,
            },
            // ข้อความที่ 2: รายละเอียดเหตุการณ์ (Flex Message)
            {
                type: 'flex',
                altText: '🚨 แจ้งเตือนช่วยเหลือด่วน!',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            {
                                type: 'text',
                                text: `🚨 แจ้งเตือนช่วยเหลือ${retryText}`,
                                weight: 'bold',
                                size: 'xl',
                                color: '#FC0303'
                            }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: 'ข้อมูลผู้สูงอายุ', weight: 'bold', size: 'md' },
                            createInfoRow('ชื่อ-สกุล', `${resTakecareperson.takecare_fname} ${resTakecareperson.takecare_sname}`),
                            createInfoRow('เบอร์โทร', resTakecareperson.takecare_tel1),
                            { type: 'separator', margin: 'md' },
                            { type: 'text', text: 'ข้อมูลผู้ดูแลหลัก', weight: 'bold', size: 'md' },
                            createInfoRow('ชื่อ-สกุล', `${resUser.users_fname} ${resUser.users_sname}`),
                            createInfoRow('เบอร์โทร', resUser.users_tel1)
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            // ปุ่ม Google Maps (นำทาง)
                            {
                                type: 'button',
                                style: 'secondary',
                                color: '#E5E5E5',
                                action: { type: 'uri', label: '📍 เปิด Google Maps นำทาง', uri: googleMapsUrl }
                            },
                            // ปุ่มตอบรับเคส
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#00b900',
                                action: {
                                    type: 'postback',
                                    label: '✅ ตอบรับเคสนี้',
                                    data: `type=accept&takecareId=${resTakecareperson.takecare_id}&extenId=${extendedHelpId}&userLineId=${resUser.users_line_id}`
                                }
                            },
                            // ปุ่มปิดเคส
                            {
                                type: 'button',
                                style: 'link',
                                color: '#FF4B4B',
                                action: {
                                    type: 'postback',
                                    label: '❌ ปิดเคส (ช่วยเหลือเรียบร้อย)',
                                    data: `type=close&takecareId=${resTakecareperson.takecare_id}&extenId=${extendedHelpId}`
                                }
                            }
                        ]
                    }
                }
            }
        ];

        // 3. ยิง API ส่งข้อความ
        await axios.post(API.PUSH, { to: group.group_line_id, messages }, { headers: LINE_HEADER });
        console.log(`Notification sent to group ${group.group_line_id}`);

    } catch (error: any) {
        console.error("Failed to send notification:", error.response?.data || error.message);
    }
};

/** * ฟังก์ชันส่งข้อความยืนยันเมื่อมีคนกด "ตอบรับ" 
 */
export const sendAcceptConfirmation = async (replyToken: string, userIdAccept: string, message: string) => {
    try {
        const profile = await getUserProfile(userIdAccept);
        const requestData = {
            to: replyToken, // หากใช้ Reply API ใน Webhook ต้องใช้ replyToken แต่ถ้าส่งทีหลังใช้ userId ได้
            messages: [{
                type: "flex",
                altText: "ตอบรับเรียบร้อย",
                contents: {
                    type: "bubble",
                    body: {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            { type: "text", text: "✅ บันทึกการตอบรับ", weight: "bold", size: "lg", color: "#00b900" },
                            { type: "text", text: `คุณ ${profile.displayName}`, margin: "md" },
                            { type: "text", text: message, wrap: true, color: "#666666", size: "sm" }
                        ]
                    }
                }
            }]
        };
        await axios.post(API.PUSH, requestData, { headers: LINE_HEADER });
    } catch (error: any) {
        console.error("Error confirming accept:", error.response?.data || error.message);
    }
};