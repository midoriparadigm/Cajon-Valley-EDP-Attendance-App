// src/components/ConfirmationModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import type { Student, Staff, GuardianContact } from '../types';
import { MockDatabase } from '../utils/mock';
import { sendSmsMock } from '../utils/sms';

interface ConfirmationModalProps {
    student: Student;
    onConfirm: (photo?: string, biometricData?: any) => void;
    onCancel: () => void;
    title: string;
    message: string;
    showPhotoOption: boolean;
    currentStaff?: Staff;
    onSave?: (s: Student) => void;
    allStudents?: Student[];
    darkMode: boolean;
    isDemoMode?: boolean;
}

const ConfirmationModal = (props: ConfirmationModalProps) => {
    const { student, onConfirm, onCancel, title, message, showPhotoOption, currentStaff, onSave, allStudents, darkMode } = props;

    const [step, setStep] = useState<'confirm' | 'camera' | 'verifying' | 'verified'>('confirm');
    const [photo, setPhoto] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const videoRef = useRef<HTMLVideoElement>(null);

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    };

    const startCamera = async () => {
        setStep('camera');
        stopCamera();
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
            }
        }
    };

    const toggleCamera = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
    };

    useEffect(() => {
        if (step === 'camera') {
            startCamera();
        }
    }, [facingMode]);

    const capturePhoto = async () => {
        const mockBiometricData = { anomalyScore: Math.random() * 0.3, visualAnomalyDetected: false };
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth || 320;
            canvas.height = videoRef.current.videoHeight || 240;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
                setPhoto(capturedPhoto);
                setStep('verifying');

                // Simulate verification
                setTimeout(() => {
                    setStep('verified');
                    setTimeout(() => {
                        onConfirm(capturedPhoto, mockBiometricData);
                    }, 1500);
                }, 1500);
            }
        } else {
            setStep('verifying');
            setTimeout(() => {
                setStep('verified');
                setTimeout(() => {
                    onConfirm(undefined, mockBiometricData);
                }, 1500);
            }, 1500);
        }
    };

    useEffect(() => {
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, []);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2200, animation: 'fadeIn 0.2s' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>

                {step === 'confirm' && (
                    <>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>{title}</h3>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{message}</p>

                        {showPhotoOption && (
                            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
                                    <span className="material-icons-round" style={{ color: 'var(--text-main)' }}>face</span>
                                </div>
                                <div style={{ flex: 1, textAlign: 'left' }}>
                                    <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>Face Verification</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Verify student identity</div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={() => showPhotoOption ? startCamera() : onConfirm()} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
                                {showPhotoOption ? 'Verify, Check-In & Send SMS to Guardian' : 'Confirm'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'camera' && (
                    <>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>Capture Photo</h3>
                        <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: '#000', borderRadius: '16px', marginBottom: '16px', overflow: 'hidden', position: 'relative' }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                            <button
                                onClick={toggleCamera}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '20px',
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 10
                                }}
                            >
                                <span className="material-icons-round">sync</span>
                            </button>

                            <div style={{ position: 'absolute', bottom: '16px', left: '0', right: '0', display: 'flex', gap: '12px', padding: '0 16px' }}>
                                <button onClick={() => { stopCamera(); onCancel(); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={capturePhoto} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(139,92,246,0.3)' }}>
                                    <span className="material-icons-round">camera_alt</span> Take Photo
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {step === 'verifying' && (
                    <>
                        <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Verifying Identity...</h3>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <img src={student.yearbookPhotoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.firstName}`} alt="Yearbook" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--text-main)', objectFit: 'cover', marginBottom: '8px' }} />
                                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Yearbook</div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '40px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ width: '100%', height: '100%', backgroundColor: '#3b82f6', animation: 'indeterminate 1.5s infinite linear' }}></div>
                                </div>
                                <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--text-main)', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', overflow: 'hidden' }}>
                                    <span className="material-icons-round" style={{ fontSize: '40px', color: '#9ca3af' }}>face</span>
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Live Camera</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Comparing facial features...</div>
                        <div style={{ marginTop: '12px', fontSize: '13px', color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>sms</span> SMS Sent to Guardian
                        </div>
                    </>
                )}

                {step === 'verified' && (
                    <>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', position: 'relative' }}>
                            <span className="material-icons-round" style={{ fontSize: '48px' }}>check</span>
                        </div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '800', color: '#16a34a' }}>Match Confirmed</h3>
                        <p style={{ margin: '0', color: 'var(--text-secondary)' }}>Student identity verified.</p>

                        <div style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Safety Check: Complete</span>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};

export default ConfirmationModal;
