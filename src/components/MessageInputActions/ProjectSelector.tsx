import { ChevronDown, Folder, FolderX } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import { AnimatePresence, motion } from 'motion/react';

interface Project {
  id: string;
  name: string;
  instructions: string;
}

const ProjectSelector = () => {
  const { chatId } = useChat();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(
    () => localStorage.getItem('projectId'),
  );

  useEffect(() => {
    const fetchProjects = async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.projects);
    };

    fetchProjects();
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const fetchChat = async () => {
      const res = await fetch(`/api/chats/${chatId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelected(data.chat?.projectId ?? null);
    };

    fetchChat();
  }, [chatId]);

  const selectProject = async (projectId: string | null) => {
    setSelected(projectId);

    if (projectId) {
      localStorage.setItem('projectId', projectId);
    } else {
      localStorage.removeItem('projectId');
    }

    if (chatId) {
      await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });
    }
  };

  const selectedProject = projects.find((p) => p.id === selected);

  return (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="p-2 text-black/50 dark:text-white/50 rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary active:scale-95 transition duration-200 hover:text-black dark:hover:text-white focus:outline-none"
          >
            <div className="flex flex-row items-center space-x-1">
              {selected ? (
                <Folder size={16} className="text-[#2196F3]" />
              ) : (
                <FolderX size={16} />
              )}
              {selectedProject && (
                <p className="text-xs font-medium text-black dark:text-white max-w-[8rem] truncate">
                  {selectedProject.name}
                </p>
              )}
              <ChevronDown
                size={16}
                className={cn(
                  open ? 'rotate-180' : 'rotate-0',
                  'transition duration:200',
                )}
              />
            </div>
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute z-10 w-64 md:w-[250px] left-0"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="origin-top-left flex flex-col space-y-2 bg-light-primary dark:bg-dark-primary border rounded-lg border-light-200 dark:border-dark-200 w-full p-2 max-h-[200px] md:max-h-none overflow-y-auto"
                >
                  <PopoverButton
                    onClick={() => selectProject(null)}
                    className={cn(
                      'p-2 rounded-lg flex flex-row items-center space-x-1 text-start duration-200 cursor-pointer transition focus:outline-none',
                      selected === null
                        ? 'bg-light-secondary dark:bg-dark-secondary'
                        : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                    )}
                  >
                    <FolderX size={16} className="text-black/50 dark:text-white/50" />
                    <p className="text-xs font-medium text-black dark:text-white">
                      No project
                    </p>
                  </PopoverButton>
                  {projects.map((project) => (
                    <PopoverButton
                      onClick={() => selectProject(project.id)}
                      key={project.id}
                      className={cn(
                        'p-2 rounded-lg flex flex-row items-center space-x-1 text-start duration-200 cursor-pointer transition focus:outline-none',
                        selected === project.id
                          ? 'bg-light-secondary dark:bg-dark-secondary'
                          : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                      )}
                    >
                      <Folder size={16} className="text-[#2196F3]" />
                      <p className="text-xs font-medium text-black dark:text-white truncate">
                        {project.name}
                      </p>
                    </PopoverButton>
                  ))}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  );
};

export default ProjectSelector;
