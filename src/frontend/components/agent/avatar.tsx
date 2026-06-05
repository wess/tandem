type AvatarLike = { avatar: string; color: string; name: string };

export const Avatar = ({ agent, size = 38 }: { agent: AvatarLike; size?: number }) => (
  <div
    className="avatar"
    style={{ width: size, height: size, background: agent.color, fontSize: Math.round(size * 0.5) }}
    title={agent.name}
  >
    <span>{agent.avatar || agent.name.slice(0, 1).toUpperCase()}</span>
  </div>
);

export const HumanAvatar = ({ size = 38 }: { size?: number }) => (
  <div className="avatar avatar-human" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
    <span>Me</span>
  </div>
);
