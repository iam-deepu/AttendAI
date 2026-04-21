import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import TeacherUpload from './components/TeacherUpload';
import StudentEnroll from './components/StudentEnroll';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [role, setRole] = useState(localStorage.getItem('role') || null);

  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    
    if (role) localStorage.setItem('role', role);
    else localStorage.removeItem('role');
  }, [token, role]);

  const handleLogout = () => {
    setToken(null);
    setRole(null);
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
        
        {/* Premium Navbar */}
        <nav className="bg-white/80 backdrop-blur-lg sticky top-0 z-50 border-b border-gray-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              
              {/* Logo / Brand */}
              <div className="flex items-center space-x-3 group cursor-pointer">
                <div className="w-10 h-10 bg-gradient-to-tr from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg transform group-hover:rotate-6 transition-transform">
                   <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </div>
                <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 tracking-tight">AttendAI</span>
              </div>

              {/* User Controls */}
              <div className="flex items-center space-x-6">
                 {token && (
                     <div className="flex items-center space-x-4">
                        <div className="flex items-center bg-gray-100/80 px-4 py-2 rounded-full border border-gray-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                            <span className="text-sm font-bold text-gray-700 capitalize tracking-wide">{role} Mode</span>
                        </div>
                        
                        <button 
                          onClick={handleLogout}
                          className="flex items-center text-sm font-bold text-gray-500 hover:text-red-500 transition-colors bg-white hover:bg-red-50 px-4 py-2 rounded-xl border border-transparent hover:border-red-100"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                          Disconnect
                        </button>
                     </div>
                 )}
              </div>

            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative">
          
          {/* Subtle background grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgydjJIMXoiIGZpbGw9IiNlN2U1ZTQiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')] opacity-50 z-0 pointer-events-none"></div>

          <div className="relative z-10 w-full h-full flex flex-col justify-center">
            <Routes>
                <Route 
                path="/login" 
                element={
                    token && role
                    ? <Navigate to={role === 'teacher' ? '/teacher' : '/student'} replace /> 
                    : <Login setToken={setToken} setRole={setRole} />
                } 
                />
                
                <Route 
                path="/teacher" 
                element={
                    token && role === 'teacher' 
                    ? <TeacherUpload token={token} /> 
                    : <Navigate to="/login" replace />
                } 
                />
                
                <Route 
                path="/student" 
                element={
                    token && role === 'student' 
                    ? <StudentEnroll token={token} /> 
                    : <Navigate to="/login" replace />
                } 
                />

                <Route path="*" element={<Navigate to={token && role ? `/${role}` : "/login"} replace />} />
            </Routes>
          </div>
        </main>

      </div>
    </Router>
  );
}

export default App;
