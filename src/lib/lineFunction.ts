import { encrypt, parseQueryString } from "@/utils/helpers";
import * as api from "@/lib/listAPI";
import axios from "axios";

// ✅ นำเข้าชื่อฟังก์ชันใหม่ให้ตรงกับ apiLineGroup.ts
import { sendEmergencyNotification, sendAcceptConfirmation } from "@/utils/apiLineGroup";

interface PostbackSafezoneProps {
    userLineId: string;
    takecarepersonId: number;
}

const getLocation = async (takecare_id: number, users_id: number, safezone_id: number) => {
    try {
        const response = await axios.get(
            `${process.env.WEB_DOMAIN}/api/location/getLocation?takecare_id=${takecare_id}&users_id=${users_id}&safezone_id=${safezone_id}`
        );
        return response.data?.data || null;
    } catch (error) {
        return null;
    }
};

/** ฟังก์ชันกลางสำหรับจัดการ Case แจ้งเตือน (Reusable) */
const handleEmergencyProcess = async (userLineId: string, takecarepersonId: number) => {
    const resUser = await api.getUser(userLineId);
    const resTakecareperson = await api.getTakecareperson(takecarepersonId.toString());

    if (resUser && resTakecareperson) {
        const resSafezone = await api.getSafezone(resTakecareperson.takecare_id, resUser.users_id);
        if (resSafezone) {
            const responseLocation = await getLocation(resTakecareperson.takecare_id, resUser.users_id, resSafezone.safezone_id);
            const resExtendedHelp = await api.getExtendedHelp(resTakecareperson.takecare_id, resUser.users_id);

            let extendedHelpId = null;
            if (resExtendedHelp) {
                extendedHelpId = resExtendedHelp.exten_id;
                await api.updateExtendedHelp({ extenId: extendedHelpId, typeStatus: "sendAgain" });
            } else {
                extendedHelpId = await api.saveExtendedHelp({
                    takecareId: resTakecareperson.takecare_id,
                    usersId: resUser.users_id,
                    typeStatus: "save",
                    safezLatitude: resSafezone.safez_latitude,
                    safezLongitude: resSafezone.safez_longitude,
                });
            }

            await sendEmergencyNotification({
                resUser,
                resTakecareperson,
                extendedHelpId,
                locationData: responseLocation,
            });

            return resUser.users_line_id;
        }
    }
    return null;
};

// --- Export Functions ตามชื่อที่ไฟล์อื่นต้องการเรียกใช้ ---

export const postbackHeartRate = async (props: PostbackSafezoneProps) =>
    handleEmergencyProcess(props.userLineId, props.takecarepersonId);

export const postbackFall = async (props: PostbackSafezoneProps) =>
    handleEmergencyProcess(props.userLineId, props.takecarepersonId);

export const postbackSafezone = async (props: PostbackSafezoneProps) =>
    handleEmergencyProcess(props.userLineId, props.takecarepersonId);

export const postbackTemp = async (props: PostbackSafezoneProps) =>
    handleEmergencyProcess(props.userLineId, props.takecarepersonId);

export const postbackAccept = async (data: any) => {
    try {
        const resUser = await api.getUser(data.userIdAccept);
        if (!resUser) {
            await sendAcceptConfirmation(data.groupId, data.userIdAccept, "ไม่พบข้อมูลของคุณไม่สามารถรับเคสได้");
            return null;
        }
        const resExtendedHelp = await api.getExtendedHelpById(data.extenId);
        if (resExtendedHelp?.exten_received_date) {
            await sendAcceptConfirmation(data.groupId, data.userIdAccept, "มีผู้รับเคสช่วยเหลือแล้ว");
            return null;
        }
        await api.updateExtendedHelp({ extenId: data.extenId, typeStatus: "received", extenReceivedUserId: resUser.users_id });
        await sendAcceptConfirmation(data.groupId, data.userIdAccept, "รับเคสช่วยเหลือแล้ว");
        return data.userLineId;
    } catch (error) { return error; }
};

export const postbackClose = async (data: any) => {
    try {
        const resUser = await api.getUser(data.userIdAccept);
        if (!resUser) {
            await sendAcceptConfirmation(data.groupId, data.userIdAccept, "ไม่พบข้อมูลของคุณไม่สามารถปิดเคสได้");
            return null;
        }
        const resExtendedHelp = await api.getExtendedHelpById(data.extenId);
        if (resExtendedHelp?.exted_closed_date) {
            await sendAcceptConfirmation(data.groupId, data.userIdAccept, "มีผู้ปิดเคสช่วยเหลือแล้ว");
            return null;
        }
        await api.updateExtendedHelp({ extenId: data.extenId, typeStatus: "close", extenClosedUserId: resUser.users_id });
        await sendAcceptConfirmation(data.groupId, data.userIdAccept, "ปิดเคสช่วยเหลือแล้ว");
        return data.userLineId;
    } catch (error) { return error; }
};