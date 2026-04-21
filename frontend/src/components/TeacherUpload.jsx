import React, { useState, useEffect } from 'react';

export default function TeacherUpload({ token }) {
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [classrooms, setClassrooms] = useState([]);
  const [activeClass, setActiveClass] = useState(null);
  const [className, setClassName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [roomNo, setRoomNo] = useState('');
  
  const [openDropdown, setOpenDropdown] = useState(null);
  const [editingClass, setEditingClass] = useState(null);
  const [deletingClass, setDeletingClass] = useState(null);
  const [editClassName, setEditClassName] = useState('');
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editRoomNo, setEditRoomNo] = useState('');
  
  const [activeTab, setActiveTab] = useState('classrooms'); // 'classrooms', 'new_classroom', 'profile'
  const [profile, setProfile] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '', password: '' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Detail state
  const [detailMode, setDetailMode] = useState('attendance'); // 'attendance' | 'manage'
  const [tab, setTab] = useState('attendance'); // 'attendance' | 'roster' | 'approvals'
  const [loading, setLoading] = useState(false);
  
  // Attendance state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [attendanceResult, setAttendanceResult] = useState(null);
  
  // Camera state
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const overlayRef = React.useRef(null);        // transparent canvas for green squares
  const detectionIntervalRef = React.useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [liveDetections, setLiveDetections] = useState([]); // [{box,name,matched,confidence}]
  
  // Roster state
  const [roster, setRoster] = useState({ approved: [], pending: [] });
  const [presentRollNos, setPresentRollNos] = useState(new Set()); // Tracking who is marked present
  const [isReviewing, setIsReviewing] = useState(false); // New mode for manual verification
  const [studentProfile, setStudentProfile] = useState(null); // Added for profile preview

  // Fetch profile once on mount only
  useEffect(() => {
    fetchProfile();
  }, []);

  // Fetch classrooms when switching back to list view
  useEffect(() => {
    if (view === 'list') {
      fetchClassrooms();
    }
  }, [view]);

  useEffect(() => {
    // Fetch roster whenever activeClass is set, as we need it for Attendance Review too
    if (view === 'detail' && activeClass) {
      fetchRoster();
    }
  }, [view, activeClass]);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClassrooms(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            setProfile(data);
            setEditData({ name: data.name, email: data.email, password: '' });
        }
    } catch (err) {
        console.error(err);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/profile/auth`, {
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
            setIsEditingProfile(false);
            fetchProfile();
        } else {
            alert(data.detail);
        }
    } catch (err) {
        console.error(err);
    }
    setLoading(false);
  };

  const handleCreateClass = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          class_name: className, 
          subject_name: subjectName,
          room_no: roomNo || null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setClassName('');
        setSubjectName('');
        setRoomNo('');
        fetchClassrooms();
        setActiveClass(data.class_code);
        setView('detail');
      } else {
        alert(data.detail);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDeleteClass = async () => {
      if (!deletingClass) return;
      setLoading(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms/${deletingClass}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
              setDeletingClass(null);
              fetchClassrooms();
          } else {
              const data = await res.json();
              alert(data.detail || "Error deleting class");
          }
      } catch (err) {
          console.error(err);
      }
      setLoading(false);
  };

  const handleUpdateClass = async () => {
      setLoading(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms/${editingClass.class_code}`, {
              method: 'PUT',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                  class_name: editClassName,
                  subject_name: editSubjectName,
                  room_no: editRoomNo || null
              })
          });
          
          if (res.ok) {
              setEditingClass(null);
              fetchClassrooms();
          } else {
              const data = await res.json();
              alert(data.detail || "Error updating class");
          }
      } catch (err) {
          console.error(err);
      }
      setLoading(false);
  };

  const fetchRoster = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms/${activeClass}/roster`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoster(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = async (rollNo) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/student_profile/${rollNo}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setStudentProfile(data);
      else alert(data.detail);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (rollNo) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/classrooms/${activeClass}/approve/${rollNo}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchRoster();
      } else {
        const err = await res.json();
        alert(err.detail);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadPhotos = async () => {
    if (!activeClass || selectedFiles.length === 0) {
        alert("Please select photos first.");
        return;
    }
    setLoading(true);
    const formData = new FormData();
    for (let i = 0; i < selectedFiles.length; i++) {
        formData.append('files', selectedFiles[i]);
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/attendance/${activeClass}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setAttendanceResult(data);
        // Pre-fill present roll numbers from AI results
        setPresentRollNos(new Set(data.recognized_students));
        setIsReviewing(true); // Enter manual review mode
        setSelectedFiles([]);
      } else {
        alert(data.detail || "Error marking attendance");
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const toggleStudentStatus = (rollNo) => {
    setPresentRollNos(prev => {
      const next = new Set(prev);
      if (next.has(rollNo)) next.delete(rollNo);
      else next.add(rollNo);
      return next;
    });
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/attendance/${activeClass}/submit`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ present_roll_nos: Array.from(presentRollNos) })
      });
      if (res.ok) {
        alert("Attendance finalized!");
        setIsReviewing(false);
        setAttendanceResult(null);
        setTab('roster'); // Switch to roster to see updated data perhaps? Or just close results.
      } else {
        const data = await res.json();
        alert(data.detail || "Error finalizing attendance");
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // ------------------------------------------
  // CAMERA FUNCTIONS
  // ------------------------------------------
  const startCamera = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          setCameraStream(stream);
          setIsCameraOpen(true);
      } catch (err) {
          console.error("Error accessing camera:", err);
          alert("Could not access your camera. Please ensure permissions are granted.");
      }
  };

  const stopCamera = () => {
      if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          setCameraStream(null);
      }
      setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedFiles(prev => [...prev, file]);
      }, 'image/jpeg');
    }
  };

  // --- LIVE DETECTION ---
  const startLiveDetection = () => {
    if (!activeClass) return;
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/detect-faces/${activeClass}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          if (!res.ok) return;
          const data = await res.json();
          setLiveDetections(data.faces || []);
          drawOverlay(data.faces || [], data.img_width, data.img_height);
        } catch (e) { /* silently ignore network blips */ }
      }, 'image/jpeg', 0.8);
    }, 1500); // poll every 1.5 seconds
  };

  const stopLiveDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setLiveDetections([]);
    // Clear overlay canvas
    if (overlayRef.current) {
      overlayRef.current.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
  };

  const drawOverlay = (faces, imgW, imgH) => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    const scaleX = video.clientWidth / imgW;
    const scaleY = video.clientHeight / imgH;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    faces.forEach(face => {
      const [x1, y1, x2, y2] = face.box;
      const rx = x1 * scaleX, ry = y1 * scaleY;
      const rw = (x2 - x1) * scaleX, rh = (y2 - y1) * scaleY;

      // Box colour: green = matched, red = unknown
      ctx.strokeStyle = face.matched ? '#00E676' : '#FF1744';
      ctx.lineWidth = 3;
      ctx.shadowColor = face.matched ? '#00E676' : '#FF1744';
      ctx.shadowBlur = 12;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.shadowBlur = 0;

      // Label background
      // If matched, show Name (Confidence)
      // If unmatched, show Unknown - [Potential Name] ([Score])
      let label = face.matched 
        ? `${face.name} (${Math.round(face.confidence * 100)}%)` 
        : `Unknown`;
      
      ctx.font = 'bold 14px Inter, sans-serif';
      const textW = ctx.measureText(label).width + 12;
      ctx.fillStyle = face.matched ? '#00E676' : '#FF1744';
      ctx.fillRect(rx, ry - 26, textW, 24);

      ctx.fillStyle = '#000';
      ctx.fillText(label, rx + 6, ry - 8);
    });
  };
  
  // Bind camera stream to video element when it becomes available
  useEffect(() => {
      if (isCameraOpen && cameraStream && videoRef.current) {
          videoRef.current.srcObject = cameraStream;
          videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().catch(e => console.error("Error playing video:", e));
              startLiveDetection(); // begin live detection once video is ready
          };
      }
      if (!isCameraOpen) stopLiveDetection();
  }, [isCameraOpen, cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
      return () => {
          if (cameraStream) stopCamera();
      };
  }, [cameraStream]);

  const handleExport = () => {
    if (!activeClass) return;
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/teacher/export/${activeClass}?token=${token}`);
  };

  // --- RENDER HELPERS ---

  const renderProfileView = () => (
    <div className="max-w-2xl mx-auto p-12 animate-fade-in-up">
        <section className="bg-white rounded-3xl p-8 border-2 border-brand-100 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">Teacher Profile</h3>
                {!isEditingProfile && (
                    <button onClick={() => setIsEditingProfile(true)} className="text-brand-600 font-bold hover:underline">Edit</button>
                )}
            </div>
            {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                        <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-bold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email / Login ID</label>
                        <input type="email" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-bold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">New Password (Optional)</label>
                        <input type="password" value={editData.password} onChange={e => setEditData({...editData, password: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-bold" placeholder="Keep blank to stay same" />
                    </div>
                    <div className="flex gap-4">
                        <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-black">Cancel</button>
                        <button type="submit" className="flex-1 py-4 bg-brand-600 text-white rounded-xl font-black shadow-lg shadow-brand-200">Save Changes</button>
                    </div>
                </form>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-brand-500 text-white rounded-2xl flex items-center justify-center text-3xl font-black">
                            {profile?.name?.[0].toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-2xl font-black text-gray-800">{profile?.name}</h4>
                            <p className="text-gray-500 font-medium">{profile?.email}</p>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1">Role</p>
                        <p className="font-bold text-gray-700 capitalize">{profile?.role}</p>
                    </div>
                </div>
            )}
        </section>
    </div>
  );

  const renderNewClassroomView = () => (
    <div className="max-w-2xl mx-auto p-12 animate-fade-in-up">
        <section className="bg-white rounded-3xl p-8 border-2 border-brand-100 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full -mr-16 -mt-16"></div>
            <div className="relative z-10">
                <h3 className="text-2xl font-black text-gray-800 mb-2">Launch Classroom</h3>
                <p className="text-gray-500 font-medium mb-8">Deploy a new AI-powered attendance hub.</p>
                
                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Classroom Name</label>
                        <input type="text" value={className} onChange={e => setClassName(e.target.value)} placeholder="e.g. Computer Science - B" className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-100 outline-none transition-all font-bold text-gray-800" />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Subject</label>
                        <input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Neural Networks" className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-100 outline-none transition-all font-bold text-gray-800" />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Room No (Optional)</label>
                                    <input type="text" value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="e.g. LAB-04" className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-100 outline-none transition-all font-bold text-gray-800" />
                                </div>
                                <button onClick={handleCreateClass} disabled={loading || !className || !subjectName} className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-3 ${!className || !subjectName ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-200 hover:-translate-y-1'}`}>
                                    {loading ? 'Creating Hub...' : 'Create Classroom'}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
  );

  const renderDetailView = () => {
    const activeClassData = classrooms.find(c => c.class_code === activeClass);
    return (
        <div className="flex flex-col lg:flex-row gap-8 animate-fade-in-up p-8">
            {/* Class Sidebar */}
            <aside className="lg:w-72 flex-shrink-0">
                <div className="bg-white rounded-3xl shadow-xl shadow-brand-100/50 border border-brand-50 overflow-hidden sticky top-8">
                    <div className="bg-gradient-to-br from-brand-700 to-indigo-900 p-8 text-white">
                        <button 
                            onClick={() => { setActiveClass(null); setView('list'); }}
                            className="flex items-center text-xs font-bold text-brand-200 hover:text-white mb-4 transition-colors group"
                        >
                            <svg className="w-4 h-4 mr-1 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                            Back to Classes
                        </button>
                        <h2 className="text-xl font-black tracking-tight leading-tight">{activeClassData?.class_name || 'Classroom'}</h2>
                        <p className="text-brand-200 text-xs font-bold uppercase tracking-widest mt-1 opacity-80">{activeClassData?.subject_name}</p>
                    </div>
                    
                    <nav className="p-4 space-y-2">
                        <button onClick={() => setTab('attendance')} className={`w-full flex items-center space-x-3 px-4 py-4 rounded-2xl text-sm font-bold transition-all ${tab === 'attendance' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                            <span>Mark Attendance</span>
                        </button>
                        <button onClick={() => setTab('approvals')} className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl text-sm font-bold transition-all ${tab === 'approvals' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Pending Approvals</span>
                            </div>
                            {roster.pending.length > 0 && <span className="bg-brand-600 text-white text-[10px] px-2 py-0.5 rounded-full ring-2 ring-white animate-pulse">{roster.pending.length}</span>}
                        </button>
                        <button onClick={() => setTab('roster')} className={`w-full flex items-center space-x-3 px-4 py-4 rounded-2xl text-sm font-bold transition-all ${tab === 'roster' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                            <span>Student Roster</span>
                        </button>
                    </nav>

                    <div className="p-6 mt-4">
                        <div className="bg-brand-50 rounded-2xl p-4 border border-brand-100">
                            <p className="text-[10px] font-black text-brand-400 uppercase tracking-widest mb-1">Class Code</p>
                            <div className="flex items-center justify-between">
                                <span className="text-brand-800 font-mono font-black text-lg">{activeClass}</span>
                                <button onClick={() => { navigator.clipboard.writeText(activeClass); alert("Code copied!"); }} className="p-1.5 hover:bg-brand-100 rounded-lg text-brand-600 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Content Area */}
            <div className="flex-1 bg-white rounded-3xl shadow-xl border border-brand-50 min-h-[600px] flex flex-col overflow-hidden">
                <div className="p-8 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-2xl font-black text-gray-800 tracking-tight">
                            {tab === 'attendance' && "Attendance Session"}
                            {tab === 'approvals' && "Pending Requests"}
                            {tab === 'roster' && "Student List"}
                        </h3>
                        <p className="text-gray-400 text-sm font-medium">
                            {tab === 'attendance' && "Capture or upload classroom photos to mark auto-attendance."}
                            {tab === 'approvals' && `You have ${roster.pending.length} students waiting to join.`}
                            {tab === 'roster' && `Tracking ${roster.approved.length} successfully registered students.`}
                        </p>
                    </div>
                    {tab === 'roster' && (
                        <button onClick={handleExport} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 transition-all active:scale-95">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Excel Report
                        </button>
                    )}
                </div>
                <div className="p-8 flex-1">
                    {tab === 'attendance' && (
                        <div className="animate-fade-in-up">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div className="bg-brand-50 rounded-2xl p-6 border-2 border-brand-100 border-dashed group hover:border-brand-300 transition-all">
                                    <div className="flex items-center space-x-4 mb-4">
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-brand-600 group-hover:scale-110 transition-transform">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        </div>
                                        <h4 className="text-lg font-black text-gray-800">Live Camera</h4>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6 font-medium">Use your camera to scan the room in real-time.</p>
                                    <button onClick={startCamera} className="w-full py-3 bg-white hover:bg-brand-600 hover:text-white text-brand-600 border border-brand-200 rounded-xl font-bold transition-all">Open Class Camera</button>
                                </div>
                                <div className="bg-indigo-50 rounded-2xl p-6 border-2 border-indigo-100 border-dashed group hover:border-indigo-300 transition-all">
                                    <div className="flex items-center space-x-4 mb-4">
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600 group-hover:scale-110 transition-transform">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        </div>
                                        <h4 className="text-lg font-black text-gray-800">Photo Upload</h4>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6 font-medium">Upload photos to mark auto-attendance.</p>
                                    <label className="w-full py-3 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 border border-indigo-200 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                                        <span>Select Files</span>
                                        <input type="file" multiple className="hidden" onChange={e => setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                                    </label>
                                </div>
                            </div>
                            {attendanceResult && (
                                <div className="bg-white border-2 border-brand-100 rounded-2xl overflow-hidden shadow-xl animate-scale-in">
                                    <div className="bg-brand-50 px-6 py-4 flex justify-between items-center border-b border-brand-100">
                                        <h4 className="font-black text-brand-900">Session Results</h4>
                                        <button onClick={() => setAttendanceResult(null)} className="text-brand-400 hover:text-brand-600 font-bold">Close X</button>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-3 gap-4 mb-6">
                                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                                <p className="text-[10px] uppercase font-black text-emerald-600 tracking-widest mb-1">Marked Present</p>
                                                <p className="text-3xl font-black text-emerald-700">{presentRollNos.size}</p>
                                            </div>
                                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                                                <p className="text-[10px] uppercase font-black text-amber-600 tracking-widest mb-1">Class Strength</p>
                                                <p className="text-3xl font-black text-amber-700">{roster.approved.length}</p>
                                            </div>
                                            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                                                <p className="text-[10px] uppercase font-black text-rose-600 tracking-widest mb-1">Unknown in Room</p>
                                                <p className="text-3xl font-black text-rose-700">{attendanceResult.unrecognized_count ?? 0}</p>
                                            </div>
                                        </div>
                                        
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Review Presence List</p>
                                        <div className="max-h-80 overflow-y-auto space-y-2 pr-2 custom-scrollbar mb-6">
                                            {roster.approved.map((student) => {
                                                const isPresent = presentRollNos.has(student.roll_no);
                                                return (
                                                    <div 
                                                        key={student.roll_no} 
                                                        onClick={() => toggleStudentStatus(student.roll_no)}
                                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                                                            isPresent 
                                                            ? 'bg-emerald-50 border-emerald-200' 
                                                            : 'bg-gray-50 border-gray-100 opacity-60'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                                                isPresent ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-300'
                                                            }`}>
                                                                {isPresent && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>}
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-gray-800 text-sm leading-none">{student.name}</p>
                                                                <p className="font-mono text-[9px] text-gray-500 mt-1 uppercase">{student.roll_no}</p>
                                                            </div>
                                                        </div>
                                                        {attendanceResult.recognized_students?.includes(student.roll_no) && (
                                                            <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">AI Verified</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <button 
                                            onClick={handleFinalSubmit}
                                            disabled={loading}
                                            className="w-full py-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl shadow-brand-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            {loading ? 'Processing...' : (
                                                <>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                    Submit & Finalize Attendance
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {tab === 'approvals' && (
                        <div className="animate-fade-in-up">
                            {roster.pending.length === 0 ? (
                                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-400 font-bold">No pending requests</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {roster.pending.map((student) => (
                                        <div key={student.roll_no} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md flex items-center justify-between group">
                                            <div>
                                                <p className="font-black text-gray-800 text-lg">{student.name}</p>
                                                <p className="text-sm font-mono text-gray-500 bg-gray-50 inline-block px-2 py-1 rounded mt-1">{student.roll_no}</p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button onClick={() => handleViewProfile(student.roll_no)} className="px-4 py-2 bg-brand-50 text-brand-700 text-xs font-bold rounded-lg transition-colors">See Profile</button>
                                                <button onClick={() => handleApprove(student.roll_no)} className="px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-brand-100 transition-all">Approve</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {tab === 'roster' && (
                        <div className="animate-fade-in-up">
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Roll Number</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Student Name</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {[...roster.approved].sort((a, b) => a.roll_no.localeCompare(b.roll_no)).map((student) => (
                                            <tr key={student.roll_no} className="hover:bg-brand-50/30 transition-colors">
                                                <td className="px-6 py-4 font-mono text-xs font-bold text-brand-600">{student.roll_no}</td>
                                                <td className="px-6 py-4 font-black text-gray-800">{student.name}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-3 text-sm font-bold text-gray-500">
                                                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-brand-500 rounded-full" style={{width: `${student.attendance_percentage || 0}%`}}></div>
                                                        </div>
                                                        {student.attendance_percentage || 0}%
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {roster.approved.length === 0 && <div className="p-12 text-center text-gray-400 font-medium">No students registered yet.</div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };

  const renderListView = () => (
    <div className="max-w-5xl mx-auto animate-fade-in-up p-8">
        <div className="flex items-center justify-between mb-12">
            <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-brand-100 rounded-2xl flex items-center justify-center text-brand-600 shadow-sm">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
                <div>
                    <h2 className="text-3xl font-black text-gray-800 tracking-tight">Teacher Dashboard</h2>
                    <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">Classroom Management</p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.map((cls) => (
                <div 
                    key={cls.class_code} 
                    className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative"
                >
                    <div className="absolute top-4 right-4 group-hover:block">
                        <div className="relative">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === cls.class_code ? null : cls.class_code); }}
                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                            </button>
                            
                            {openDropdown === cls.class_code && (
                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-20 py-2 animate-scale-in origin-top-right">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingClass(cls); setEditClassName(cls.class_name); setEditSubjectName(cls.subject_name); setEditRoomNo(cls.room_no || ''); setOpenDropdown(null); }}
                                        className="w-full text-left px-4 py-2 text-sm font-bold text-gray-600 hover:bg-brand-50 hover:text-brand-600 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                        Edit Details
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setDeletingClass(cls.class_code); setOpenDropdown(null); }}
                                        className="w-full text-left px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        Delete Forever
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="inline-block p-3 bg-brand-50 rounded-xl mb-4 group-hover:bg-brand-600 transition-colors">
                            <svg className="w-6 h-6 text-brand-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"></path></svg>
                        </div>
                        <h4 className="text-xl font-black text-gray-800 truncate mb-1">{cls.class_name}</h4>
                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest truncate">{cls.subject_name}</p>
                    </div>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Passcode</p>
                            <p className="text-lg font-black text-brand-600 font-mono tracking-tighter">{cls.class_code}</p>
                        </div>
                        <button 
                            onClick={() => { setActiveClass(cls.class_code); setView('detail'); }}
                            className="px-5 py-2.5 bg-gray-50 hover:bg-brand-600 text-gray-600 hover:text-white rounded-xl text-xs font-black transition-all transform active:scale-95 border border-gray-100 hover:border-brand-600 shadow-sm"
                        >
                            Open Hub
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderEditModal = () => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="text-lg font-bold text-gray-800">Edit Session Details</h3>
                <button onClick={() => setEditingClass(null)} className="text-gray-400 hover:text-gray-600 outline-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div className="p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                    <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input type="text" value={editSubjectName} onChange={e => setEditSubjectName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room No</label>
                    <input type="text" value={editRoomNo} onChange={e => setEditRoomNo(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold" />
                </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
                <button onClick={() => setEditingClass(null)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                <button onClick={handleUpdateClass} disabled={loading || !editClassName || !editSubjectName} className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-100 transition-all disabled:opacity-50">{loading ? 'Saving...' : 'Save Changes'}</button>
            </div>
        </div>
    </div>
  );

  const renderDeleteModal = () => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
            <div className="p-8 text-center">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 className="text-2xl font-black text-gray-800 mb-2">Delete Hub?</h3>
                <p className="text-gray-500 font-medium">This will permanently wipe this classroom and all its data. This action is irreversible.</p>
            </div>
            <div className="px-6 py-5 bg-gray-50 flex gap-3">
                <button onClick={() => setDeletingClass(null)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">Abort</button>
                <button onClick={handleDeleteClass} disabled={loading} className="flex-1 py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-lg shadow-red-100 transition-all disabled:opacity-50">{loading ? '...' : 'Yes, Delete'}</button>
            </div>
        </div>
    </div>
  );

  const renderStudentProfileModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setStudentProfile(null)}>
        <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="relative h-64 bg-gray-200">
                {studentProfile.reference_photo ? <img src={`data:image/jpeg;base64,${studentProfile.reference_photo}`} alt="Student Reference" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400"><svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>}
                <button onClick={() => setStudentProfile(null)} className="absolute top-4 right-4 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full backdrop-blur-md transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            <div className="p-8 text-center">
                <h4 className="text-3xl font-black text-gray-800 mb-1">{studentProfile.name}</h4>
                <p className="text-brand-600 font-black tracking-widest text-[10px] uppercase mb-8 bg-brand-50 inline-block px-4 py-1 rounded-full">{studentProfile.roll_no}</p>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-left mb-8">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email Connection</p>
                    <p className="text-gray-800 font-bold text-lg">{studentProfile.email}</p>
                </div>
                <div className="flex gap-4">
                    <button onClick={() => setStudentProfile(null)} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black rounded-2xl transition-all">Review Later</button>
                    <button onClick={() => { handleApprove(studentProfile.roll_no); setStudentProfile(null); }} className="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl shadow-xl shadow-brand-200 transition-all hover:-translate-y-1">Approve Student</button>
                </div>
            </div>
        </div>
    </div>
  );

  const renderCameraModal = () => (
    <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-3xl relative bg-black rounded-[40px] overflow-hidden shadow-2xl border-[12px] border-gray-900 aspect-video">

            {/* Live video feed */}
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />

            {/* Transparent overlay canvas for green/red squares */}
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Hidden capture canvas */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Close button */}
            <div className="absolute top-6 right-6">
                <button onClick={() => { stopLiveDetection(); stopCamera(); }} className="bg-white/10 hover:bg-red-600 text-white p-4 rounded-full backdrop-blur-xl transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            {/* Live detection badge */}
            <div className="absolute top-6 left-6 flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 w-fit">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    <span className="text-white text-xs font-bold">Live Detection</span>
                    {liveDetections.length > 0 && (
                      <span className="text-green-400 text-xs font-bold">· {liveDetections.filter(f => f.matched).length} recognised</span>
                    )}
                </div>
                {selectedFiles.length > 0 && (
                    <div className="flex items-center gap-2 bg-brand-600/80 backdrop-blur-xl px-4 py-2 rounded-full border border-brand-400/50 w-fit animate-fade-in">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span className="text-white text-[10px] font-black uppercase tracking-widest">{selectedFiles.length} Frames Captured</span>
                    </div>
                )}
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-12">
                {/* Single capture shutter */}
                <button
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full border-[6px] border-brand-200 active:scale-90 transition-all flex items-center justify-center shadow-2xl"
                  title="Capture single frame"
                >
                    <div className="w-14 h-14 rounded-full border-2 border-gray-200"></div>
                </button>

                {/* Finish & Run AI */}
                <button
                  onClick={() => { 
                      if (selectedFiles.length === 0) {
                          alert("Please click the circular capture button to take at least one photo of the class before running AI.");
                          return;
                      }
                      stopLiveDetection(); 
                      stopCamera(); 
                      handleUploadPhotos(); 
                  }}
                  className="px-8 py-4 bg-brand-600 text-white rounded-2xl font-black shadow-xl shadow-brand-900/40 hover:bg-brand-500 transition-all"
                >
                    Finish &amp; Run AI
                </button>
            </div>
        </div>
    </div>
  );

  // ------------------------------------------
  // RENDER: DISPATCHER

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFF] overflow-hidden font-sans">
      {/* Primary Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-100 flex flex-col shrink-0 z-50">
        <div className="p-4 md:p-8 border-b border-gray-50 flex items-center md:flex-col justify-between md:justify-start">
          <div className="flex items-center space-x-3 md:space-x-0 md:flex-col md:items-center">
             <div className="w-10 h-10 md:w-16 md:h-16 bg-brand-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white md:mb-4 shadow-xl shadow-brand-100 shrink-0">
               <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
             </div>
             <div>
               <h1 className="text-base md:text-lg font-black text-gray-800 tracking-tighter">AttendAI</h1>
               <p className="text-[8px] md:text-[9px] font-black text-brand-500 uppercase tracking-widest mt-0.5">Teacher Central</p>
             </div>
          </div>
          {/* Hamburger Toggle */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-gray-50 text-gray-600 border border-gray-100"
          >
            {isMobileMenuOpen ? (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            ) : (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            )}
          </button>
        </div>

        <nav className={`${isMobileMenuOpen ? 'flex absolute top-[88px] left-0 w-full bg-white shadow-2xl border-b border-gray-100 z-50 px-4 pb-4' : 'hidden'} md:flex flex-col p-4 md:p-6 space-y-2 md:space-y-1.5 shrink-0 md:flex-1 items-stretch md:static md:shadow-none md:border-none`}>
          <button onClick={() => { setActiveTab('classrooms'); setView('list'); setActiveClass(null); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all ${activeTab === 'classrooms' ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-transparent md:border-transparent'}`}>
            <svg className="w-5 h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            <span>My Classrooms</span>
          </button>
          
          <button onClick={() => { setActiveTab('new_classroom'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all ${activeTab === 'new_classroom' ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-transparent md:border-transparent'}`}>
            <svg className="w-5 h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            <span>Launch New Hub</span>
          </button>
          
          <button onClick={() => { setActiveTab('profile'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all ${activeTab === 'profile' ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100 md:border-none' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-transparent md:border-transparent'}`}>
            <svg className="w-5 h-5 shadow-inner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span>My Profile</span>
          </button>

          {/* Mobile Disconnect */}
          <button 
            onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
            className="md:hidden mt-4 w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-red-50 text-red-500 font-bold text-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"></path></svg>
            <span>Disconnect</span>
          </button>
        </nav>

        <div className="hidden md:block p-6 border-t border-gray-50">
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
        {activeTab === 'classrooms' && (
          <div className="p-0">
            {view === 'list' ? renderListView() : renderDetailView()}
          </div>
        )}
        {activeTab === 'new_classroom' && <div className="p-8">{renderNewClassroomView()}</div>}
        {activeTab === 'profile' && <div className="p-8">{renderProfileView()}</div>}

        {/* Global Overlays & Modals */}
        {editingClass && renderEditModal()}
        {deletingClass && renderDeleteModal()}
        {studentProfile && renderStudentProfileModal()}
        {isCameraOpen && renderCameraModal()}
      </main>
    </div>
  );
}
