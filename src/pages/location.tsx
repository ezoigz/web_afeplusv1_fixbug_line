'use client'
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'

import { GoogleMap, Marker, useLoadScript, InfoWindow, DrawingManager, Polygon, Circle, DirectionsRenderer } from '@react-google-maps/api';
import Spinner from 'react-bootstrap/Spinner';

import styles from '@/styles/page.module.css'
import { encrypt } from '@/utils/helpers'

interface Location {
    latitude: number;
    longitude: number;
}
interface DataUserState {
    isLogin: boolean;
    userData: any | null
    takecareData: any | null
}

const Location = () => {
    const router = useRouter();
    // const { loadScript } = useLoadScript();
    const { isLoaded } = useLoadScript({
        googleMapsApiKey: process.env.GoogleMapsApiKey as string
    });
    const containerStyle = {
        width: '100vw',
        height: '100vh'
    };

    const [mapRef, setMapRef] = useState()
    const [infoWindowData, setInfoWindowData] = useState({ id: 0, address: '', show: false });
    const [alert, setAlert] = useState({ show: false, message: '' });
    const [isLoading, setLoading] = useState(true);
    const [dataUser, setDataUser] = useState<DataUserState>({ isLogin: false, userData: null, takecareData: null })
    const [directions, setDirections] = useState<any | null>(null);
    const [range1, setRange1] = useState(10)
    const [range2, setRange2] = useState(20)


    const [origin, setOrigin] = useState({ lat: 0, lng: 0 }); // Default origin (Safezone)
    const [destination, setDestination] = useState({ lat: 0, lng: 0 }); // Default destination (ผู้สูงอายุ)
    const [caretaker, setCaretaker] = useState<{ lat: number; lng: number } | null>(null); // ตำแหน่งผู้ดูแล (local)
    const [caretakerRemote, setCaretakerRemote] = useState<{ lat: number; lng: number } | null>(null); // ตำแหน่งผู้ดูแล (ล่าสุดจาก backend)
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const caretakerPollingRef = useRef<NodeJS.Timeout | null>(null);

    // ====== ย้าย onGetUserData มาไว้ตรงนี้ ======
    const onGetUserData = useCallback(async (auToken: string) => {
        try {
            const responseUser = await axios.get(`${process.env.WEB_DOMAIN}/api/user/getUser/${auToken}`);
            if (responseUser.data?.data) {
                const encodedUsersId = encrypt(responseUser.data?.data.users_id.toString());
                const responseTakecareperson = await axios.get(`${process.env.WEB_DOMAIN}/api/user/getUserTakecareperson/${encodedUsersId}`);
                const data = responseTakecareperson.data?.data
                if (data) {
                    setDataUser({ isLogin: false, userData: responseUser.data?.data, takecareData: data })
                    onGetSafezone(router.query.idsafezone as string, data, responseUser.data?.data)
                } else {
                    alertModal()
                }
            } else {
                alertModal()
            }
        } catch (error) {
            setDataUser({ isLogin: false, userData: null, takecareData: null })
            setAlert({ show: true, message: 'ระบบไม่สามารถดึงข้อมูลของท่านได้ กรุณาลองใหม่อีกครั้ง' })
            setLoading(false)
        }
    }, [router.query.idsafezone]);
    // ====== จบย้าย ======

    // Polling ตำแหน่งผู้สูงอายุและผู้ดูแลแบบเรียลไทม์
    useEffect(() => {
        const auToken = router.query.auToken
        if (auToken && isLoaded) {
            onGetUserData(auToken as string)
        }
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (caretakerPollingRef.current) clearInterval(caretakerPollingRef.current);
        };
    }, [router.query.auToken, isLoaded, onGetUserData]);

    // Polling ดึงตำแหน่งล่าสุดทุก 5 วินาที
    const startPollingLocation = (safezoneData: any, takecareData: any, userData: any) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(() => {
            onGetLocation(safezoneData, takecareData, userData, true);
        }, 3000);
        // Polling ตำแหน่งผู้ดูแล (remote) ทุก 3 วินาที
        if (caretakerPollingRef.current) clearInterval(caretakerPollingRef.current);
        caretakerPollingRef.current = setInterval(() => {
            fetchCaretakerRemote(userData, takecareData);
        }, 3000);
    };
    // ส่งตำแหน่งผู้ดูแลไป backend ทุกครั้งที่ caretaker (local) เปลี่ยน
    useEffect(() => {
        if (!caretaker || !dataUser.userData || !dataUser.takecareData) return;
        const sendCaretakerLocation = async () => {
            try {
                await axios.post('/api/caretakerLocation', {
                    users_id: dataUser.userData.users_id,
                    takecare_id: dataUser.takecareData.takecare_id,
                    latitude: caretaker.lat,
                    longitude: caretaker.lng,
                });
            } catch (e) {
                // ignore
            }
        };
        sendCaretakerLocation();
    }, [caretaker, dataUser.userData, dataUser.takecareData]);

    // ดึงตำแหน่งผู้ดูแลล่าสุดจาก backend
    const fetchCaretakerRemote = async (userData: any, takecareData: any) => {
        if (!userData || !takecareData) return;
        try {
            const res = await axios.get(`/api/caretakerLocation?users_id=${userData.users_id}&takecare_id=${takecareData.takecare_id}`);
            if (res.data?.data) {
                setCaretakerRemote({
                    lat: Number(res.data.data.locat_latitude),
                    lng: Number(res.data.data.locat_longitude),
                });
            }
        } catch (e) {
            // ignore
        }
    };

    useEffect(() => {
        if (isLoaded) {
            const directionsService = new window.google.maps.DirectionsService();

            directionsService.route(
                {
                    origin: new window.google.maps.LatLng(origin.lat, origin.lng),
                    destination: new window.google.maps.LatLng(destination.lat, destination.lng),
                    travelMode: window.google.maps.TravelMode.DRIVING,
                },
                (result, status) => {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                        setDirections(result);
                    } else {
                        setDirections(null);
                    }
                }
            );
        }
    }, [origin, destination, isLoaded]);

    const onGetSafezone = async (idSafezone: string, takecareData: any, userData: any) => {
        try {
            const resSafezone = await axios.get(`${process.env.WEB_DOMAIN}/api/setting/getSafezone?takecare_id=${takecareData.takecare_id}&users_id=${userData.users_id}&id=${idSafezone}`);
            if (resSafezone.data?.data) {
                const data = resSafezone.data?.data
                setOrigin({
                    lat: Number(data.safez_latitude),
                    lng: Number(data.safez_longitude),
                });
                setRange1(data.safez_radiuslv1)
                setRange2(data.safez_radiuslv2)
                onGetLocation(data, takecareData, userData)
                startPollingLocation(data, takecareData, userData);
            }
        } catch (error) {
            setDataUser({ isLogin: false, userData: null, takecareData: null })
            setAlert({ show: true, message: 'ระบบไม่สามารถดึงข้อมูล Safezone ของท่านได้ กรุณาลองใหม่อีกครั้ง' })
            setLoading(false)
        }
    }

    const onGetLocation = async (safezoneData: any, takecareData: any, userData: any, silent = false) => {
        try {
            const resLocation = await axios.get(`${process.env.WEB_DOMAIN}/api/location/getLocation?takecare_id=${takecareData.takecare_id}&users_id=${userData.users_id}&safezone_id=${safezoneData.safezone_id}&location_id=${router.query.idlocation}`);
            if (resLocation.data?.data) {
                const data = resLocation.data?.data
                setDestination({
                    lat: Number(data.locat_latitude),
                    lng: Number(data.locat_longitude),
                });
            } else {
                setDestination({
                    lat: Number(safezoneData.safez_latitude),
                    lng: Number(safezoneData.safez_longitude),
                });
            }
            if (!silent) setLoading(false)
        } catch (error) {
            setDataUser({ isLogin: false, userData: null, takecareData: null })
            setAlert({ show: true, message: 'ระบบไม่สามารถดึงข้อมูล Safezone ของท่านได้ กรุณาลองใหม่อีกครั้ง' })
            setLoading(false)
        }
    }
    // Geolocation API: ตำแหน่งผู้ดูแล (Caretaker)
    useEffect(() => {
        let geoWatchId: number | null = null;
        if (navigator.geolocation) {
            geoWatchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setCaretaker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => {
                    // ไม่อนุญาตหรือ error
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
            );
        }
        return () => {
            if (geoWatchId !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(geoWatchId);
            }
        };
    }, []);

    const alertModal = () => {
        setAlert({ show: true, message: 'ระบบไม่สามารถดึงข้อมูลของท่านได้ กรุณาลองใหม่อีกครั้ง' })
        setDataUser({ isLogin: false, userData: null, takecareData: null })
    }

    const center = useMemo(() => ({ lat: destination.lat, lng: destination.lng }), [destination]);

    const handleMarkerClick = (id: number, lat: number, lng: number, address: string) => {
        //     mapRef?.panTo({ lat, lng });
        setInfoWindowData({ id, address, show: true });
    };
    const polygonOptions = {
        strokeColor: "yellow",
        strokeOpacity: 0.5,
        strokeWeight: 3.0,
        fillColor: "red",
        fillOpacity: 0.2,
    };

    if ((origin.lat === 0 && origin.lng === 0) || (destination.lat === 0 && destination.lng === 0)) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <Spinner animation="border" variant="primary" />
            </div>
        )
    }

    return (
        <>
            {
                !isLoaded ? (
                    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                        <Spinner animation="border" variant="primary" />
                    </div>
                ) : (
                    <>
                        <GoogleMap
                            clickableIcons={false}
                            mapContainerStyle={containerStyle}
                            center={center}
                            zoom={14}
                            options={{
                                mapTypeControl: true,
                                streetViewControl: false,
                                zoomControlOptions: {
                                    position: google.maps.ControlPosition.LEFT_CENTER,
                                },
                            }}
                        >
                            {/* Marker ผู้สูงอายุ */}
                            <Marker
                                position={{ lat: destination.lat, lng: destination.lng }}
                                icon={{
                                    url: 'https://maps.google.com/mapfiles/kml/pal2/icon6.png',
                                    scaledSize: new window.google.maps.Size(35, 35)
                                }}
                                onClick={() => {
                                    handleMarkerClick(1, destination.lat, destination.lng, 'ผู้สูงอายุ');
                                }}
                            >
                                {infoWindowData.show && (
                                    <InfoWindow
                                        onCloseClick={() => {
                                            setInfoWindowData({ id: 0, address: '', show: false });
                                        }}
                                    >
                                        <h3>{infoWindowData.address}</h3>
                                    </InfoWindow>
                                )}
                            </Marker>
                            {/* Marker Safezone */}
                            <Marker
                                position={{ lat: origin.lat, lng: origin.lng }}
                                icon={{
                                    url: 'https://maps.google.com/mapfiles/kml/pal2/icon10.png',
                                    scaledSize: new window.google.maps.Size(35, 35),
                                }}
                            >
                                <>
                                    <Circle
                                        center={{ lat: origin.lat, lng: origin.lng }}
                                        radius={range1}
                                        options={{ fillColor: "#F2BE22", strokeColor: "#F2BE22", fillOpacity: 0.2 }}
                                    />
                                    <Circle
                                        center={{ lat: origin.lat, lng: origin.lng }}
                                        radius={range2}
                                        options={{ fillColor: "#F24C3D", strokeColor: "#F24C3D", fillOpacity: 0.1 }}
                                    />
                                </>
                            </Marker>
                            {/* Marker ผู้ดูแล (Caretaker - คุณ) */}
                            {caretaker && (
                                <Marker
                                    position={{ lat: caretaker.lat, lng: caretaker.lng }}
                                    icon={{
                                        url: 'https://maps.google.com/mapfiles/kml/pal2/icon13.png',
                                        scaledSize: new window.google.maps.Size(35, 35),
                                    }}
                                    onClick={() => handleMarkerClick(2, caretaker.lat, caretaker.lng, 'ผู้ดูแล (คุณ)')}
                                >
                                    {infoWindowData.show && infoWindowData.id === 2 && (
                                        <InfoWindow
                                            onCloseClick={() => setInfoWindowData({ id: 0, address: '', show: false })}
                                        >
                                            <h3>{infoWindowData.address}</h3>
                                        </InfoWindow>
                                    )}
                                </Marker>
                            )}
                            {/* Marker ผู้ดูแล (Caretaker - remote/ล่าสุด) */}
                            {caretakerRemote && (
                                <Marker
                                    position={{ lat: caretakerRemote.lat, lng: caretakerRemote.lng }}
                                    icon={{
                                        url: 'https://maps.google.com/mapfiles/kml/pal2/icon15.png',
                                        scaledSize: new window.google.maps.Size(35, 35),
                                    }}
                                    onClick={() => handleMarkerClick(3, caretakerRemote.lat, caretakerRemote.lng, 'ผู้ดูแล (ล่าสุด)')}
                                >
                                    {infoWindowData.show && infoWindowData.id === 3 && (
                                        <InfoWindow
                                            onCloseClick={() => setInfoWindowData({ id: 0, address: '', show: false })}
                                        >
                                            <h3>{infoWindowData.address}</h3>
                                        </InfoWindow>
                                    )}
                                </Marker>
                            )}
                            {directions && <DirectionsRenderer directions={directions} />}
                        </GoogleMap>
                        <div className={styles.buttonLayout}>
                            {dataUser.takecareData?.takecare_tel1 && (
                                <a className={`btn btn-primary ${styles.button}`} href={`tel:${dataUser.takecareData?.takecare_tel1}`}> โทรหาผู้สูงอายุ <i className="fas fa-phone"></i> </a>
                            )}
                        </div>
                    </>
                )
            }
        </>
    )
}

export default Location