import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Workspace() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <div className="flex-1 flex items-center justify-content-center">
        <h1 className="text-2xl font-bold">AI Coding Studio</h1>
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
