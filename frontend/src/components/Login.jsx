import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ setToken, setRole }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Handle Login (OAuth2 form data style)
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData
        });

        const data = await res.json();
        
        if (res.ok) {
          setToken(data.access_token);
          // decode role from jwt or fetch user/me - here we'll just fetch /users/me
          const userRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/users/me`, {
              headers: { 'Authorization': `Bearer ${data.access_token}` }
          });
          const userData = await userRes.json();
          setRole(userData.role);
          
          if (userData.role === 'teacher') navigate('/teacher');
          else if (userData.role === 'student') navigate('/student');
          
        } else {
          setError(data.detail || 'Login Failed. Check credentials.');
        }

      } else {
        // Handle Signup (JSON)
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name,
            email: email,
            password: password,
            role: selectedRole
          })
        });

        const data = await res.json();
        if (res.ok) {
           setToken(data.access_token);
           setRole(selectedRole);
           if (selectedRole === 'teacher') navigate('/teacher');
           else if (selectedRole === 'student') navigate('/student');
        } else {
           setError(data.detail || 'Signup Failed. Please try a different email.');
        }
      }
    } catch (err) {
      setError('Network Error. Ensure the backend server is running on port 8000.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Decorative background blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse-slow"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse-slow" style={{ animationDelay: '1s' }}></div>

      <div className="max-w-md w-full space-y-8 bg-white/10 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/20 animate-fade-in-up relative z-10">
        
        <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-gradient-to-tr from-brand-400 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
                <svg className="w-8 h-8 text-white transform -rotate-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
                {isLogin ? 'Welcome Back' : 'Join AttendAI'}
            </h2>
            <p className="mt-2 text-sm text-brand-200">
                {isLogin ? 'Sign in to access your dashboard' : 'Create an account to get started'}
            </p>
        </div>
        
        {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-100 px-4 py-3 rounded-xl text-sm text-center backdrop-blur-md">
                {error}
            </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            
            {!isLogin && (
               <div>
                 <label className="block text-sm font-medium text-brand-100 mb-1">Full Name</label>
                 <input 
                    name="name" 
                    type="text" 
                    required 
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-brand-200/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white/10 transition-all duration-200" 
                    placeholder="John Doe" 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                 />
               </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-brand-100 mb-1">Email Address</label>
              <input 
                name="email" 
                type="email" 
                required 
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-brand-200/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white/10 transition-all duration-200" 
                placeholder="you@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-brand-100 mb-1">Password</label>
              <input 
                name="password" 
                type="password" 
                required 
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-brand-200/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white/10 transition-all duration-200" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            
            {!isLogin && (
               <div>
                 <label className="block text-sm font-medium text-brand-100 mb-1">Role</label>
                 <select 
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-900 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all duration-200 appearance-none"
                 >
                     <option value="student">Student</option>
                     <option value="teacher">Teacher</option>
                 </select>
               </div>
            )}
            
          </div>

          <div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-xl text-brand-900 bg-gradient-to-r from-brand-300 to-brand-400 hover:from-white hover:to-brand-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-brand-900 transition-all duration-300 transform hover:scale-[1.02] shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-brand-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (isLogin ? 'Sign In to Dashboard' : 'Create Account')}
            </button>
          </div>
        </form>
        
        <div className="text-center mt-6">
            <button 
               onClick={() => {setIsLogin(!isLogin); setError('');}}
               className="text-sm text-brand-200 hover:text-white transition-colors duration-200"
            >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
        </div>
      </div>
    </div>
  );
}
