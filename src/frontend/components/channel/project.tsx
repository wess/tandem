import type { ChannelProject, ChannelProjectStatus } from "../../../shared/types.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";

// M5.1 — human-friendly labels for the link lifecycle. The dot colour is driven
// by the same status via the `.is{status}` class in styles.css.
const STATUS_LABEL: Record<ChannelProjectStatus, string> = {
  unlinked: "Unlinked",
  linked: "Linked",
  deploying: "Deploying",
  live: "Live",
  error: "Error",
};

const repoLabel = (p: ChannelProject): string | null => {
  if (p.repoOwner && p.repoName) return `${p.repoOwner}/${p.repoName}`;
  return p.repoName || p.repoOwner || null;
};

// A small panel reading store.projectByChannel[channelId]: repo, deploy
// host/url, status, and last sha. Hydrated by getChannelProject on channel
// select (see selectChannel) and kept live by "project:updated" events. Renders
// nothing until a project row exists for the channel, so non-project channels
// stay clean.
export const ProjectPanel = ({ channelId }: { channelId: number }) => {
  const project = useStore((s) => s.projectByChannel[channelId]);
  if (!project) return null;

  const repo = repoLabel(project);
  const sha = project.lastSha ? project.lastSha.slice(0, 7) : null;
  const deploy = project.deployHost || null;

  return (
    <div className="projpanel">
      <span className={`projstatus is${project.status}`} title={STATUS_LABEL[project.status]}>
        <span className="projdot" />
        {STATUS_LABEL[project.status]}
      </span>
      {repo &&
        (project.repoUrl ? (
          <a className="projitem projrepo" href={project.repoUrl} target="_blank" rel="noreferrer">
            <Icon name="book" size={13} /> {repo}
          </a>
        ) : (
          <span className="projitem projrepo">
            <Icon name="book" size={13} /> {repo}
          </span>
        ))}
      {deploy && (
        <span className="projitem" title="Deploy host">
          <Icon name="chart" size={13} /> {deploy}
        </span>
      )}
      {sha && (
        <span className="projitem projsha" title={project.lastSha}>
          <Icon name="hash" size={13} /> {sha}
        </span>
      )}
    </div>
  );
};
