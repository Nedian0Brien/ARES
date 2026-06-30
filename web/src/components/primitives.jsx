const T = {
  bg:'#fbfbfa', sb:'#f5f5f4', s1:'#ffffff', s2:'#f7f7f6', s3:'#f0efed',
  b1:'#e8e8e6', b2:'#d4d4d2', tx:'#0a0a0b', t2:'#4a4a50', t3:'#8a8a92', t4:'#b0b0b8',
  read:'#5e6ad2', search:'#5e9c6f', research:'#8957c9', result:'#c07b3a', insight:'#c04e68', writing:'#3aa3a3',
};
const mono = { fontFamily:"'JetBrains Mono',monospace" };

const Icon = ({ name, size=15, color='currentColor', style={} }) => {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:1.75, strokeLinecap:'round', strokeLinejoin:'round', style };
  const paths = {
    search:<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    book:<><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
    sparkles:<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    pdf:<><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M9 14h6M9 17h6M9 11h2"/></>,
    chat:<><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    note:<><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 12h8M8 16h5"/></>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    send:<><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
    highlight:<><path d="M12 20l9-9-4-4-9 9v4z"/><path d="M14 7l4 4"/><path d="M3 21h7"/></>,
    link:<><path d="M10 13a5 5 0 007.1 0l2-2a5 5 0 00-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 00-7.1 0l-2 2A5 5 0 0012 20.1l1.1-1.1"/></>,
    pen:<><path d="M17 3l4 4L7 21H3v-4L17 3z"/></>,
    quote:<><path d="M6 8c0-1 1-2 2-2h2v6H6V8zM14 8c0-1 1-2 2-2h2v6h-4V8z"/></>,
    chevR:<path d="M9 6l6 6-6 6"/>,
    chevD:<path d="M6 9l6 6 6-6"/>,
    chevL:<path d="M15 6l-6 6 6 6"/>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    check:<path d="M20 6L9 17l-5-5"/>,
    x:<><path d="M18 6L6 18M6 6l12 12"/></>,
    dot:<circle cx="12" cy="12" r="4" fill={color} stroke="none"/>,
    moreH:<><circle cx="6" cy="12" r="1.4" fill={color} stroke="none"/><circle cx="12" cy="12" r="1.4" fill={color} stroke="none"/><circle cx="18" cy="12" r="1.4" fill={color} stroke="none"/></>,
    arrowR:<><path d="M5 12h14M12 5l7 7-7 7"/></>,
    status_done:<><circle cx="12" cy="12" r="9" fill={color} stroke="none"/><path d="M8 12l3 3 5-6" stroke="#fff"/></>,
    status_run:<><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 019 9" stroke={color} strokeWidth="2.5"/></>,
    status_todo:<circle cx="12" cy="12" r="9" strokeDasharray="2 3"/>,
    status_queue:<circle cx="12" cy="12" r="9"/>,
    bookmark:<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"/>,
    download:<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    share:<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></>,
    columns:<><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></>,
    rows:<><rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/></>,
    table:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 15h18M9 5v14M15 5v14"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5-11 11"/></>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.01"/></>,
    flask:<><path d="M9 3h6"/><path d="M10 3v6L4.5 18a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9V3"/><path d="M7 15h10"/></>,
    list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    layers:<><path d="M12 2l10 5-10 5L2 7l10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></>,
    sidebar:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
    bulb:<><path d="M9 18h6M10 21h4M12 3a6 6 0 014 10.5c-.7.7-1 1.3-1 2.5H9c0-1.2-.3-1.8-1-2.5A6 6 0 0112 3z"/></>,
    folder:<path d="M3 6.5A1.5 1.5 0 014.5 5H9l1.6 2H19.5A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19H4.5A1.5 1.5 0 013 17.5z"/>,
  };
  return <svg {...p}>{paths[name]}</svg>;
};

const Tag = ({ label, color, dot }) => (
  <span className="tag" style={color ? { background:`color-mix(in srgb, ${color} 12%, transparent)`, color, borderColor:`color-mix(in srgb, ${color} 30%, transparent)` } : {}}>
    {dot && <span style={{ width:5, height:5, borderRadius:'50%', background:color||T.t3 }} />}
    {label}
  </span>
);
const Kbd = ({ children }) => <span className="kbd">{children}</span>;
const StatusIcon = ({ status }) => {
  const map = { done:T.search, running:T.result, todo:T.t3, queue:T.t4 };
  const color = map[status] || T.t3;
  if (status==='done') return <Icon name="status_done" size={13} color={color}/>;
  if (status==='running') return <span style={{ display:'inline-flex', animation:'pulse 1.5s infinite' }}><Icon name="status_run" size={13} color={color}/></span>;
  if (status==='todo') return <Icon name="status_todo" size={13} color={T.t3}/>;
  return <Icon name="status_queue" size={13} color={T.t4}/>;
};

export { Icon, Kbd, StatusIcon, T, Tag, mono };
