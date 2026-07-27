export function ProjectFolderCard({ projectName }: { projectName: string }) {
    return (
        <div className="bg-muted rounded-md text-muted-foreground h-auto  hover:text-foreground  py-2.5 text-left text-sm transition-colors aspect-video w-50 grid-rows-2 grid-cols-2 gap-2">
            <div className="grid-rows-2 grid-cols-2 gap-2">
                        <p>{projectName}</p>
            </div>
    </div>
  );
}