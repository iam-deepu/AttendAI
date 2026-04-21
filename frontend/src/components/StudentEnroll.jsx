import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function StudentEnroll({ token }) {
  const [rollNo, setRollNo] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [faceFound, setFaceFound] = useState(false);
  const [debugData, setDebugData] = useState({ matrix: false, landmarks: false, fps: 0 });
  const [joinClassCode, setJoinClassCode] = useState('');
  const [studentClassrooms, setStudentClassrooms] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'enroll', 'join'
  const [menuOpen, setMenuOpen] = useState(null); // To track which class menu is open
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', roll_no: '', email: '', password: '' });

  // Camera state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  // MediaPipe / Head Pose state
  const landmarkerRef = useRef(null);
  const [angles, setAngles] = useState({ yaw: 0, pitch: 0 }); // Current head angles
  const [angleBias, setAngleBias] = useState(null); // Calibration: neutral pose
  const [progress, setProgress] = useState(0); // Progress ring (0-100)
  const lastCaptureTimeRef = useRef(0);
  const smoothedYawRef = useRef(0);
  const smoothedPitchRef = useRef(0);
  const stabilityCounterRef = useRef(0);
  const biasFramesRef = useRef([]); // To average first few frames for bias
  const faceFoundRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  // FaceID Guided Setup State
  const [captureStep, setCaptureStep] = useState(0);
  const captureInstructions = [
      "Look Straight into the camera",
      "Turn your head slightly Left",
      "Turn your head slightly Right",
      "Tilt your head Upwards",
      "Tilt your head Downwards"
  ];

  // ------------------------------------------
  // CAMERA FUNCTIONS
  // ------------------------------------------
  const startCamera = async () => {
      setFiles([]);
      setCaptureStep(0);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          setCameraStream(stream);
          setIsCameraOpen(true);
      } catch (err) {
          console.error("Error accessing camera:", err);
          alert("Could not access your camera. Please ensure permissions are granted.");
      }
  };

  const calculateBlurScore = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Convert to grayscale
    const greyscale = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      greyscale[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    
    // Simple Laplacian Filter
    let sum = 0;
    let sumSq = 0;
    const count = (width - 2) * (height - 2);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap = (
          greyscale[i - width] + 
          greyscale[i - 1] + 
          -4 * greyscale[i] + 
          greyscale[i + 1] + 
          greyscale[i + width]
        );
        sum += lap;
        sumSq += lap * lap;
      }
    }
    
    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    return variance;
  };

  const stopCamera = () => {
      if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          setCameraStream(null);
      }
      setIsCameraOpen(false);
      setAngleBias(null); // Reset calibration on stop
      biasFramesRef.current = [];
  };

  const captureGuidedPhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
        if (blob) {
            setFiles(prev => {
                const step = prev.length;
                const file = new File([blob], `frame_${step}.jpg`, { type: 'image/jpeg' });
                const newFiles = [...prev, file];
                if (newFiles.length === 5) {
                    stopCamera();
                }
                return newFiles;
            });
            setCaptureStep(prev => prev + 1);
            setProgress(0); // Reset progress ring after capture
        }
    }, 'image/jpeg', 0.95);
  }, []);

  // Initialize MediaPipe Landmarker
  useEffect(() => {
    const initLandmarker = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        outputFaceLandmarks: true, // Enable landmarks as fallback
        runningMode: "VIDEO",
        numFaces: 1
      });
    };
    initLandmarker();
  }, []);

  // Target angles (relative to bias) and their UI positions (relative to center of dial)
  const targetAngles = [
    { yaw: 0, pitch: 0, tol: 8, x: 0, y: 0 },         // Straight
    { yaw: 25, pitch: 0, tol: 12, x: 60, y: 0 },     // Left (UI is mirrored usually)
    { yaw: -25, pitch: 0, tol: 12, x: -60, y: 0 },   // Right
    { pitch: 15, yaw: 0, tol: 10, x: 0, y: -50 },    // Up
    { pitch: -15, yaw: 0, tol: 10, x: 0, y: 50 }     // Down
  ];

  // Detection loop
  useEffect(() => {
    let animationId;
    
    const detect = async () => {
      if (isCameraOpen && videoRef.current && landmarkerRef.current && captureStep < 5) {
        // Ensure video is actually providing data
        if (videoRef.current.readyState < 2) {
           animationId = requestAnimationFrame(detect);
           return;
        }

        let results;
        try {
          results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        } catch (err) {
          console.error("Landmark error:", err);
        }
        
        const found = (results?.facialTransformationMatrixes?.length > 0) || (results?.faceLandmarks?.length > 0);
        
        if (found !== faceFoundRef.current) {
          faceFoundRef.current = found;
          setFaceFound(found);
        }

        // Throttle debug updates
        frameCountRef.current++;
        if (performance.now() - lastFpsUpdateRef.current > 1000) {
           setDebugData({
             matrix: results?.facialTransformationMatrixes?.length > 0,
             landmarks: results?.faceLandmarks?.length > 0,
             fps: frameCountRef.current
           });
           frameCountRef.current = 0;
           lastFpsUpdateRef.current = performance.now();
        }

        if (found) {
          let rawYaw = 0;
          let rawPitch = 0;

          if (results.facialTransformationMatrixes?.length > 0) {
            // Priority 1: High-fidelity Matrix
            const matrix = results.facialTransformationMatrixes[0].data;
            rawYaw = -Math.atan2(matrix[2], matrix[10]) * (180 / Math.PI); // Inverted for mirror
            rawPitch = Math.asin(-matrix[6]) * (180 / Math.PI);
          } else if (results.faceLandmarks?.length > 0) {
            // Priority 2: Landmark Fallback (Heuristics)
            const lm = results.faceLandmarks[0];
            // Yaw calculation: Nose tip (1) relative to eye corners (33, 263)
            const nose = lm[1];
            const leftEye = lm[33];
            const rightEye = lm[263];
            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            const eyeDist = Math.abs(rightEye.x - leftEye.x);
            rawYaw = ((nose.x - eyeMidX) / eyeDist) * 100; // Inverted heuristic

            // Pitch calculation: Eye-mouth relationship
            const leftMouth = lm[61];
            const rightMouth = lm[291];
            const mouthMidY = (leftMouth.y + rightMouth.y) / 2;
            const eyeMidY = (leftEye.y + rightEye.y) / 2;
            const faceHeight = Math.abs(mouthMidY - eyeMidY);
            rawPitch = ((nose.y - (eyeMidY + faceHeight * 0.4)) / faceHeight) * 80; // Heuristic scale
          }
          
          // 1. Initial Calibration (Bias)
          if (!angleBias && captureStep === 0) {
            biasFramesRef.current.push({ y: rawYaw, p: rawPitch });
            if (biasFramesRef.current.length >= 5) {
              const avgY = biasFramesRef.current.reduce((a, b) => a + b.y, 0) / 5;
              const avgP = biasFramesRef.current.reduce((a, b) => a + b.p, 0) / 5;
              setAngleBias({ yaw: avgY, pitch: avgP });
              biasFramesRef.current = [];
            }
          }

          // 2. Apply Bias
          if (angleBias) {
            rawYaw -= angleBias.yaw;
            rawPitch -= angleBias.pitch;
          }
          
          // 3. Smooth the values
          smoothedYawRef.current = smoothedYawRef.current * 0.7 + rawYaw * 0.3;
          smoothedPitchRef.current = smoothedPitchRef.current * 0.7 + rawPitch * 0.3;
          
          setAngles({ yaw: smoothedYawRef.current, pitch: smoothedPitchRef.current });

          // 4. Check target
          const target = targetAngles[captureStep];
          const dy = Math.abs(smoothedYawRef.current - target.yaw);
          const dp = Math.abs(smoothedPitchRef.current - target.pitch);
          const dist = Math.sqrt(dy * dy + dp * dp);

          // Update Progress (more sensitive)
          const newProgress = Math.max(0, Math.min(100, 100 - (dist * 3)));
          setProgress(newProgress);

          if (dist < target.tol && angleBias) {
            stabilityCounterRef.current++;
            if (stabilityCounterRef.current > 15 && (performance.now() - lastCaptureTimeRef.current > 2000)) {
              if (canvasRef.current && videoRef.current) {
                const canvas = canvasRef.current;
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
                const score = calculateBlurScore(canvas);
                
                if (score > 15) { // Slightly lower threshold for easier capture
                  captureGuidedPhoto();
                  lastCaptureTimeRef.current = performance.now();
                  stabilityCounterRef.current = 0;
                } else {
                  stabilityCounterRef.current = 10; 
                }
              }
            }
          } else {
            stabilityCounterRef.current = 0;
          }
        }
      }
      animationId = requestAnimationFrame(detect);
    };

    if (isCameraOpen) detect();
    return () => cancelAnimationFrame(animationId);
  }, [isCameraOpen, captureStep, captureGuidedPhoto, angleBias]);


  // Bind camera stream to video element when it becomes available
  useEffect(() => {
      if (isCameraOpen && cameraStream && videoRef.current) {
          videoRef.current.srcObject = cameraStream;
          videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().catch(e => console.error("Error playing video:", e));
          };
      }
  }, [isCameraOpen, cameraStream]);

  const fetchProfile = async () => {
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            setProfile(data);
            setEditData({ name: data.name, roll_no: data.roll_no || '', email: data.email, password: '' });
            if (data.roll_no) setRollNo(data.roll_no);
        }
    } catch (err) {
        console.error(err);
    }
  };

  const fetchClassrooms = async () => {
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/classrooms`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
              setStudentClassrooms(data);
          }
      } catch (err) {
          console.error(err);
      }
  };

  useEffect(() => {
      fetchClassrooms();
      fetchProfile();
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
      return () => {
          if (cameraStream) stopCamera();
      };
  }, [cameraStream]);

  const handleEnroll = async () => {
    if (files.length !== 5) {
      alert("Please upload exactly 5 photos from different angles.");
      return;
    }

    // Roll number must be set – guide the user to My Profile if missing
    const effectiveRollNo = profile?.roll_no || rollNo;
    if (!effectiveRollNo || effectiveRollNo.trim() === '') {
      alert("⚠️ Please set your Roll Number first — go to My Profile and save it before registering your AI Identity.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('roll_no', effectiveRollNo.trim());
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert("✅ AI Identity registered successfully!");
        setFiles([]);
        setCaptureStep(0);
        fetchProfile();
      } else {
        // FastAPI can return detail as a string OR a list of validation error objects
        const errMsg = typeof data.detail === 'string'
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map(e => e.msg || JSON.stringify(e)).join(', ')
            : JSON.stringify(data.detail);
        alert("Enrollment failed: " + errMsg);
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Please ensure the backend is running.");
    }
    setLoading(false);
  };

  const handleJoinClass = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/join_class/${joinClassCode}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok) {
            alert("Request sent! Waiting for teacher approval.");
            setJoinClassCode('');
            setActiveTab('dashboard');
            fetchClassrooms();
        } else {
            alert(data.detail);
        }
      } catch (err) {
          console.error(err);
      }
      setLoading(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(editData)
        });
        const data = await res.json();
        if (res.ok) {
            alert("Profile updated successfully!");
            setIsEditing(false);
            fetchProfile();
        } else {
            alert(data.detail);
        }
    } catch (err) {
        console.error(err);
    }
    setLoading(false);
  };

  const handleLeaveClass = async (classCode) => {
      if (!window.confirm(`Are you sure you want to leave ${classCode}?`)) return;
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/student/leave_class/${classCode}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
              fetchClassrooms();
              setMenuOpen(null);
          }
      } catch (err) {
          console.error(err);
      }
  };

  const renderDashboardView = () => (
    <div className="space-y-8 animate-fade-in-up p-8">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-black text-gray-800 tracking-tight">Student Dashboard</h2>
                <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">My Enrolled Hubs</p>
            </div>
            <button onClick={() => setActiveTab('join')} className="bg-brand-600 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-xl shadow-brand-100 hover:-translate-y-1 transition-all">Join New Class</button>
        </div>

        {studentClassrooms.length === 0 ? (
            <div className="bg-white rounded-[40px] p-20 text-center border border-gray-100 shadow-xl shadow-brand-100/20">
                 <div className="w-24 h-24 bg-brand-50 text-brand-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                 </div>
                 <h4 className="text-2xl font-black text-gray-800 mb-2">Workspace Empty</h4>
                 <p className="text-gray-400 font-medium mb-8 max-w-sm mx-auto text-sm">You haven't connected to any classrooms yet. Start your journey by entering a class code.</p>
                 <button onClick={() => setActiveTab('join')} className="bg-gray-800 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-gray-900 transition-all shadow-xl">Get Started Now</button>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {studentClassrooms.map((cls) => (
                    <div key={cls.class_code} className="group bg-white rounded-[32px] border border-gray-100 shadow-xl shadow-brand-100/20 hover:shadow-2xl hover:shadow-brand-100/40 hover:-translate-y-1 transition-all p-8 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-2 h-full bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex justify-between items-start mb-6">
                            <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${cls.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {cls.status === 'approved' ? '✓ Registered' : '⌛ Waiting Approval'}
                            </div>
                            <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === cls.class_code ? null : cls.class_code); }} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-300 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                                </button>
                                {menuOpen === cls.class_code && (
                                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 py-2 animate-scale-in">
                                        <button onClick={() => handleLeaveClass(cls.class_code)} className="w-full text-left px-5 py-3 text-xs font-black text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"></path></svg>
                                            Disconnect Hub
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <h4 className="text-2xl font-black text-gray-800 mb-1 group-hover:text-brand-600 transition-colors">{cls.class_name}</h4>
                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-6">{cls.subject_name}</p>
                        
                        <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                            <div className="flex items-center gap-2 text-[10px] font-black text-brand-500 bg-brand-50 px-3 py-1.5 rounded-lg uppercase tracking-widest">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
                                {cls.class_code}
                            </div>
                            {cls.status === 'approved' && (
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Attendance: <span className="text-brand-600">{cls.attendance_percentage || 0}%</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );

  const renderEnrollView = () => (
    <div className="max-w-3xl mx-auto space-y-12 animate-fade-in-up p-8">
        <div className="text-center">
            <h2 className="text-4xl font-black text-gray-800 tracking-tight mb-2">AI Identity Model</h2>
            <p className="text-gray-400 font-medium">Keep your biometric data updated for lightning-fast auto-attendance.</p>
        </div>

        <section className="bg-white rounded-[40px] p-10 border border-brand-50 shadow-xl shadow-brand-100/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-50 rounded-full -mr-24 -mt-24 transition-transform group-hover:scale-110"></div>
            
            <div className="flex flex-col md:flex-row gap-10 relative z-10 items-center">
                <div className="w-40 h-40 rounded-[32px] overflow-hidden shadow-2xl border-4 border-white ring-8 ring-brand-50/50 flex-shrink-0">
                    {profile?.reference_photo ? (
                        <img src={`data:image/jpeg;base64,${profile.reference_photo}`} alt="Identity" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-brand-100 flex items-center justify-center text-brand-400">
                            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
                        </div>
                    )}
                </div>
                
                <div className="flex-1 text-center md:text-left">
                    <div className="mb-6">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${profile?.is_enrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {profile?.is_enrolled ? '✓ AI Model Active' : '⚠ Action Required'}
                        </span>
                        <h4 className="text-3xl font-black text-gray-800 mt-4 tracking-tight">{profile?.name}</h4>
                        <p className="text-brand-600 font-black tracking-widest text-xs uppercase mt-1 px-4 py-1 bg-brand-50 inline-block rounded-xl">{profile?.roll_no || 'NOT REGISTERED'}</p>
                    </div>
                </div>
            </div>
        </section>

        <section className="bg-white rounded-[40px] p-10 border-2 border-dashed border-brand-200 shadow-sm relative transition-all">
            <div className="flex items-center space-x-4 mb-8">
                <div className="w-14 h-14 bg-brand-600 text-white font-black rounded-2xl flex items-center justify-center shadow-lg shadow-brand-100 italic text-2xl">AI</div>
                <div>
                    <h3 className="text-2xl font-black text-gray-800 tracking-tight">Biometric Capture</h3>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Update your facial recognition data</p>
                </div>
            </div>
            
            <div className="space-y-8">
                <div>
                    <div className="flex items-center justify-between mb-4 mt-4">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference Frames ({files.length}/5)</label>
                        {files.length > 0 && <button onClick={() => { setFiles([]); setAngleBias(null); setCaptureStep(0); }} className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline">Flush All</button>}
                    </div>
                    
                    {!isCameraOpen ? (
                        <button onClick={startCamera} disabled={files.length >= 5} className={`flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-3xl transition-all group ${files.length >= 5 ? 'border-gray-100 bg-gray-50 text-gray-300' : 'border-brand-200 bg-white hover:bg-brand-50 text-brand-600 hover:border-brand-500 shadow-xl shadow-brand-100/20'}`}>
                            <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-2xl mb-4 flex items-center justify-center group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                            <p className="text-lg font-black">{profile?.is_enrolled ? "Update Facial Model" : "Start Registration"}</p>
                            <p className="text-xs font-bold opacity-60 mt-1 uppercase tracking-widest">Capture 5 Multi-Angle Frames</p>
                        </button>
                    ) : (
                        <div className="bg-black rounded-[40px] overflow-hidden relative shadow-2xl border-[8px] border-gray-900 aspect-[3/4] md:aspect-video flex items-center justify-center">
                            <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover scale-x-[-1] brightness-110 object-center" />
                            <canvas ref={canvasRef} className="hidden" />
                            
                            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
                                 <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90" viewBox="0 0 100 100">
                                     <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
                                     <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="301.59" strokeDashoffset={301.59 - (301.59 * progress / 100)} className="text-brand-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,1)]" strokeLinecap="round" />
                                 </svg>

                                 <div className="relative w-64 h-64 md:w-80 md:h-80 aspect-square flex-shrink-0 rounded-full border-[6px] border-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.75)] flex items-center justify-center overflow-hidden">
                                      <div className="w-full h-full rounded-full border border-white/40 ring-4 ring-white/10 ring-inset"></div>
                                      
                                      {/* Helper Dot (Joystick) */}
                                      <div 
                                        className="absolute w-6 h-6 border-2 border-brand-400 rounded-full transition-transform duration-75 ease-out mix-blend-difference"
                                        style={{ transform: `translate(${angles.yaw * 2}px, ${-angles.pitch * 2}px)` }}
                                      >
                                        <div className="absolute inset-0 bg-brand-400 rounded-full animate-pulse opacity-50"></div>
                                      </div>

                                      {/* Target Indicator */}
                                      {captureStep < 5 && angleBias && (
                                        <div 
                                            className="absolute w-10 h-10 rounded-full border-2 border-white/60 flex items-center justify-center transition-all duration-300"
                                            style={{ transform: `translate(${targetAngles[captureStep].x}px, ${targetAngles[captureStep].y}px)` }}
                                        >
                                            <div className="w-3 h-3 bg-brand-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,1)]"></div>
                                        </div>
                                      )}
                                 </div>

                                 <div className="absolute bottom-16 left-0 right-0 z-30 pointer-events-none">
                                    {!faceFound && isCameraOpen && (
                                        <div className="flex justify-center mb-2">
                                            <span className="text-[10px] font-black text-amber-400 bg-amber-900/40 px-3 py-1 rounded-full uppercase tracking-tighter shadow-lg">Searching for Face...</span>
                                        </div>
                                    )}
                                    {!angleBias && faceFound && captureStep === 0 && (
                                        <div className="flex justify-center mb-2">
                                            <span className="text-[10px] font-black text-brand-400 animate-pulse bg-brand-900/40 px-3 py-1 rounded-full uppercase tracking-tighter shadow-lg">Calibrating... Hand Steady </span>
                                        </div>
                                    )}
                                    <p className="text-white font-black text-2xl tracking-tight text-center px-4 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                                        {captureStep < 5 ? (angleBias || captureStep > 0 ? captureInstructions[captureStep] : "Look Straight") : "Scan Complete!"}
                                    </p>
                                    {captureStep < 5 && (
                                        <div className="mt-4 flex justify-center">
                                            <div className="flex space-x-2">
                                                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                                 <div className="absolute top-6 left-6 z-40 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none">
                                    <div className="flex items-center space-x-3 text-[9px] font-black uppercase tracking-widest">
                                        <div className="flex items-center space-x-1">
                                            <span className="text-gray-400">FPS:</span>
                                            <span className={debugData.fps > 15 ? 'text-emerald-400' : 'text-amber-400'}>{debugData.fps}</span>
                                        </div>
                                        <div className="w-px h-2 bg-white/10"></div>
                                        <div className="flex items-center space-x-1">
                                            <span className="text-gray-400">Mode:</span>
                                            <span className="text-white">{debugData.matrix ? 'Dual' : (debugData.landmarks ? 'Fallback' : 'None')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute top-6 right-6 flex gap-4 z-40">
                                <div className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-white/20">Step {Math.min(captureStep + 1, 5)}/5</div>
                                <button type="button" onClick={stopCamera} className="bg-white/10 hover:bg-red-600 text-white p-3 rounded-xl backdrop-blur-md transition-all pointer-events-auto">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {files.length > 0 && (
                        <div className="mt-8 mb-8 border-t border-gray-100 pt-8">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Captured Neural Signatures</h4>
                            <div className="grid grid-cols-5 gap-4">
                                {files.map((file, idx) => (
                                    <div key={idx} className={`relative group aspect-square rounded-2xl border-4 ${idx === 0 ? 'border-brand-500 shadow-brand-500/30' : 'border-gray-100'} overflow-hidden`}>
                                        <img src={URL.createObjectURL(file)} alt="Ref" className="w-full h-full object-cover transition-transform scale-x-[-1]" />
                                        {idx === 0 && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-brand-900/80 to-transparent flex items-end justify-center pb-2">
                                                <span className="text-[8px] font-black text-white uppercase tracking-widest">Profile Avatar</span>
                                            </div>
                                        )}
                                        <button onClick={() => setFiles(prev => {
                                            const newFiles = prev.filter((_, i) => i !== idx);
                                            setCaptureStep(newFiles.length);
                                            return newFiles;
                                        })} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 shadow-xl transition-all hover:scale-110 -translate-y-2 group-hover:translate-y-0">→</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    <button onClick={handleEnroll} disabled={loading || files.length !== 5} className={`w-full py-5 px-6 rounded-[24px] font-black text-white shadow-2xl transition-all transform active:scale-[0.98] ${files.length !== 5 ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-200 hover:-translate-y-1'}`}>
                        {loading ? 'Processing Neural Signatures...' : 'Finalize & Update Identity'}
                    </button>
                </div>
            </div>
        </section>
    </div>
  );

  const renderJoinView = () => (
    <div className="max-w-xl mx-auto py-20 animate-fade-in-up p-8">
        <div className="bg-white rounded-[40px] p-12 border border-brand-50 shadow-2xl shadow-brand-100/20 relative overflow-hidden text-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full -mr-16 -mt-16"></div>
            <div className="w-24 h-24 bg-brand-100 text-brand-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner italic font-black text-3xl">#</div>
            
            <h2 className="text-3xl font-black text-gray-800 mb-2">Connect to HUB</h2>
            <p className="text-gray-400 font-medium mb-10 max-w-xs mx-auto text-sm uppercase tracking-widest">Enter the unique 6-digit class code shared by your teacher</p>
            
            <div className="space-y-8">
                <div className="relative">
                    <input 
                        type="text" 
                        maxLength="6"
                        value={joinClassCode} 
                        onChange={e => setJoinClassCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} 
                        className="w-full px-8 py-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] text-gray-800 text-4xl font-black tracking-[0.5em] focus:bg-white focus:outline-none focus:ring-8 focus:ring-brand-500/5 focus:border-brand-500 transition-all text-center placeholder:text-gray-200" 
                        placeholder="XXXXXX" 
                    />
                </div>
                
                <button 
                    onClick={handleJoinClass}
                    disabled={loading || joinClassCode.length !== 6}
                    className={`w-full py-6 px-10 rounded-[32px] font-black text-lg text-white shadow-2xl transition-all transform active:scale-95 ${joinClassCode.length !== 6 ? 'bg-gray-200 cursor-not-allowed shadow-none' : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-300 hover:-translate-y-1'}`}
                >
                    {loading ? 'Authenticating...' : 'Submit Join Request'}
                </button>
            </div>
        </div>
    </div>
  );

  const renderProfileView = () => (
    <div className="max-w-2xl mx-auto animate-fade-in-up p-8">
        <div className="bg-white rounded-[40px] border border-brand-50 shadow-2xl shadow-brand-100/20 overflow-hidden">
            <div className="bg-brand-600 p-10 text-white relative">
                <div className="bg-white/10 backdrop-blur-xl absolute inset-0"></div>
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter">My Account</h2>
                        <p className="text-brand-100 font-bold uppercase tracking-[0.2em] text-[10px] mt-1">Personal Settings</p>
                    </div>
                </div>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="p-10 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Display Name</label>
                        <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-brand-500/10 outline-none font-bold text-gray-800 transition-all shadow-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Roll Number</label>
                        <input type="text" value={editData.roll_no} onChange={e => setEditData({...editData, roll_no: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-brand-500/10 outline-none font-bold text-gray-800 transition-all shadow-sm font-mono" />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Email Address / Login ID</label>
                    <input type="email" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-brand-500/10 outline-none font-bold text-gray-800 transition-all shadow-sm" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Change Password</label>
                    <input type="password" value={editData.password} onChange={e => setEditData({...editData, password: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-brand-500/10 outline-none font-bold text-gray-800 transition-all shadow-sm" placeholder="••••••••" />
                    <p className="text-[10px] font-bold text-gray-400 mt-2 italic px-1">Leave blank to keep current security credential</p>
                </div>
                
                <div className="pt-6">
                    <button type="submit" disabled={loading} className="w-full py-5 bg-brand-600 hover:bg-brand-700 text-white rounded-[24px] font-black shadow-2xl shadow-brand-200 transition-all transform hover:-translate-y-1 active:scale-95">
                        {loading ? "Syncing Credentials..." : "Update Security Settings"}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFF] overflow-hidden font-sans">
      {/* Primary Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-100 flex flex-col shrink-0 z-50">
        <div className="p-4 md:p-8 border-b border-gray-50 flex items-center md:flex-col justify-between md:justify-start">
          <div className="flex items-center space-x-3 md:space-x-0 md:flex-col md:items-center">
             <div className="w-10 h-10 md:w-16 md:h-16 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white md:mb-4 shadow-xl shadow-indigo-100 shrink-0">
               <svg className="w-6 h-6 md:w-8 md:h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
             </div>
             <div>
               <h1 className="text-base md:text-lg font-black text-gray-800 tracking-tighter">AttendAI</h1>
               <p className="text-[8px] md:text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-0.5">Student Hub</p>
             </div>
          </div>
          {/* Mobile Disconnect Button */}
          <button 
            onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
            className="md:hidden p-2 rounded-xl bg-gray-50 text-red-500 border border-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"></path></svg>
          </button>
        </div>

        <nav className="flex md:flex-col p-4 md:p-6 space-x-3 md:space-x-0 md:space-y-1.5 overflow-x-auto md:overflow-y-auto custom-scrollbar shrink-0 md:flex-1 items-center md:items-stretch">
          <button onClick={() => setActiveTab('dashboard')} className={`shrink-0 md:w-full flex items-center space-x-2 md:space-x-3 px-4 py-2 md:py-3.5 rounded-full md:rounded-2xl text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-gray-100 md:border-transparent'}`}>
            <svg className="w-4 h-4 md:w-5 md:h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            <span>My Dashboard</span>
          </button>
          
          <button onClick={() => setActiveTab('join')} className={`shrink-0 md:w-full flex items-center space-x-2 md:space-x-3 px-4 py-2 md:py-3.5 rounded-full md:rounded-2xl text-xs font-bold transition-all ${activeTab === 'join' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-gray-100 md:border-transparent'}`}>
            <svg className="w-4 h-4 md:w-5 md:h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Join Class</span>
          </button>

          <button onClick={() => setActiveTab('enroll')} className={`shrink-0 md:w-full flex items-center space-x-2 md:space-x-3 px-4 py-2 md:py-3.5 rounded-full md:rounded-2xl text-xs font-bold transition-all ${activeTab === 'enroll' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-gray-100 md:border-transparent'}`}>
            <svg className="w-4 h-4 md:w-5 md:h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>AI Identity</span>
          </button>
          
          <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all ${activeTab === 'profile' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}>
            <svg className="w-5 h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span>My Profile</span>
          </button>
        </nav>

        <div className="p-6 border-t border-gray-50">
          <button 
            onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 transition-all font-bold text-xs border border-gray-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"></path></svg>
            <span>Disconnect</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 overflow-y-auto relative custom-scrollbar bg-[#F9FAFF]">
        {activeTab === 'dashboard' && renderDashboardView()}
        {activeTab === 'enroll' && renderEnrollView()}
        {activeTab === 'join' && renderJoinView()}
        {activeTab === 'profile' && renderProfileView()}
      </main>
    </div>
  );
}
