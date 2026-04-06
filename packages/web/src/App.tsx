import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { WorkspacePage } from '@/pages/workspace';
import { SettingsPage } from '@/pages/settings';
import { HistoryPage } from '@/pages/history';

function NavBar() {
  const location = useLocation();

  const links = [
    { to: '/', label: '工作区' },
    { to: '/history', label: '历史' },
    { to: '/settings', label: '设置' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4">
      <div className="flex items-center h-10">
        <span className="text-sm font-bold text-purple-400 mr-6">
          AI Coding Studio
        </span>
        <div className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                location.pathname === link.to
                  ? 'bg-gray-800 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen bg-gray-950">
        <NavBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<WorkspacePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
