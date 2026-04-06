import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TaskStatus } from '@ai-coding-studio/shared';

function Workspace() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Coding Studio</h1>
          <p className="text-gray-400 mt-2">Status: {TaskStatus.PENDING}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
      </Routes>
    </BrowserRouter>
  );
}
