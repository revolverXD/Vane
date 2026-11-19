'use client';

import { Folder, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Project {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
}

const Page = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newInstructions, setNewInstructions] = useState('');

  const fetchProjects = async () => {
    setLoading(true);
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async () => {
    if (newName.trim().length === 0) return;

    await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newName.trim(),
        instructions: newInstructions,
      }),
    });

    setNewName('');
    setNewInstructions('');
    fetchProjects();
  };

  const saveProject = async (project: Project) => {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: project.name,
        instructions: project.instructions,
      }),
    });

    fetchProjects();
  };

  const deleteProject = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    fetchProjects();
  };

  const updateLocal = (id: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  return (
    <div>
      <div className="flex flex-col pt-10 border-b border-light-200/20 dark:border-dark-200/20 pb-6 px-2">
        <div className="flex items-center justify-center">
          <Folder size={45} className="mb-2.5" />
          <div className="flex flex-col">
            <h1
              className="text-5xl font-normal p-2 pb-0"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              Projects
            </h1>
            <div className="px-2 text-sm text-black/60 dark:text-white/60 text-center lg:text-left">
              Persistent workspaces with their own instructions.
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 px-2">
        <div className="rounded-2xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary p-4 flex flex-col gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="bg-light-secondary dark:bg-dark-secondary rounded-lg px-3 py-2 text-sm text-black dark:text-white focus:outline-none"
          />
          <textarea
            value={newInstructions}
            onChange={(e) => setNewInstructions(e.target.value)}
            placeholder="Instructions added to every chat in this project..."
            rows={3}
            className="bg-light-secondary dark:bg-dark-secondary rounded-lg px-3 py-2 text-sm text-black dark:text-white resize-y focus:outline-none"
          />
          <button
            onClick={createProject}
            disabled={newName.trim().length === 0}
            className="self-start inline-flex items-center gap-1 bg-sky-500 hover:bg-sky-500/85 text-white disabled:opacity-50 text-sm rounded-full px-4 py-2 transition duration-200"
          >
            <Plus size={16} />
            Create project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-row items-center justify-center min-h-[40vh]">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-light-200 fill-light-secondary dark:text-[#202020] animate-spin dark:fill-[#ffffff3b]"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100.003 78.2051 78.1951 100.003 50.5908 100C22.9765 99.9972 0.997224 78.018 1 50.4037C1.00281 22.7993 22.8108 0.997224 50.4251 1C78.0395 1.00281 100.018 22.8108 100 50.4251ZM9.08164 50.594C9.06312 73.3997 27.7909 92.1272 50.5966 92.1457C73.4023 92.1642 92.1298 73.4365 92.1483 50.6308C92.1669 27.8251 73.4392 9.0973 50.6335 9.07878C27.8278 9.06026 9.10003 27.787 9.08164 50.594Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4037 97.8624 35.9116 96.9801 33.5533C95.1945 28.8227 92.871 24.3692 90.0681 20.348C85.6237 14.1775 79.4473 9.36872 72.0454 6.45794C64.6435 3.54717 56.3134 2.65431 48.3133 3.89319C45.869 4.27179 44.3768 6.77534 45.014 9.20079C45.6512 11.6262 48.1343 13.0956 50.5786 12.717C56.5073 11.8281 62.5542 12.5399 68.0406 14.7911C73.527 17.0422 78.2187 20.7487 81.5841 25.4923C83.7976 28.5886 85.4467 32.059 86.4416 35.7474C87.1273 38.1189 89.5423 39.6781 91.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
            <Folder className="text-black/70 dark:text-white/70" />
          </div>
          <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
            No projects yet. Create one above.
          </p>
        </div>
      ) : (
        <div className="pt-6 pb-28 px-2">
          <div className="rounded-2xl border border-light-200 dark:border-dark-200 overflow-hidden bg-light-primary dark:bg-dark-primary">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className={
                  'flex flex-col gap-3 p-4 ' +
                  (index !== projects.length - 1
                    ? 'border-b border-light-200 dark:border-dark-200'
                    : '')
                }
              >
                <div className="flex items-center gap-3">
                  <input
                    value={project.name}
                    onChange={(e) =>
                      updateLocal(project.id, { name: e.target.value })
                    }
                    className="flex-1 bg-transparent text-black dark:text-white text-base font-medium focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => saveProject(project)}
                      className="text-sm bg-sky-500 hover:bg-sky-500/85 text-white rounded-full px-3 py-1.5 transition duration-200"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-1.5 text-black/50 dark:text-white/50 hover:text-red-500 transition duration-200"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <textarea
                  value={project.instructions}
                  onChange={(e) =>
                    updateLocal(project.id, { instructions: e.target.value })
                  }
                  rows={3}
                  placeholder="Project instructions..."
                  className="bg-light-secondary dark:bg-dark-secondary rounded-lg px-3 py-2 text-sm text-black dark:text-white resize-y focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;
