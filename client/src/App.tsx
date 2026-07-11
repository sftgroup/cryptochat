import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import { authStore } from './lib/api';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!authStore.token);
  const [page, setPage] = useState<'chat' | 'profile'>('chat');

  useEffect(() => {
    if (authStore.token) setLoggedIn(true);
  }, []);

  function handleLogin() {
    setLoggedIn(true);
  }

  function handleLogout() {
    authStore.clear();
    setLoggedIn(false);
    setPage('chat');
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  if (page === 'profile') {
    return <ProfilePage onBack={() => setPage('chat')} onLogout={handleLogout} />;
  }

  return <ChatPage onLogout={handleLogout} onGoProfile={() => setPage('profile')} />;
}
