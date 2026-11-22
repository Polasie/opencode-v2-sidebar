// Exact copy of the Home grouping function in the official OpenCode V2 asset.
const ORIGINAL_PM =
  'function pm(e,t){let n=new Date,r=fm(n),i=fm(new Date(n.getFullYear(),n.getMonth(),n.getDate()-1)),a=e=>fm(new Date(e.session.time.updated??e.session.time.created)),o=e.filter(e=>a(e)===r),s=e.filter(e=>a(e)===i),c=e.filter(e=>a(e)!==r&&a(e)!==i),l=o.length===0&&s.length===0?t.t(`sidebar.project.recentSessions`):t.t(`home.sessions.group.older`);return[{id:`today`,title:t.t(`home.sessions.group.today`),sessions:o},{id:`yesterday`,title:t.t(`home.sessions.group.yesterday`),sessions:s},{id:`older`,title:l,sessions:c}].filter(e=>e.sessions.length>0)}';

const ORIGINAL_GG =
  'function gg(e){return(()=>{var t=Hh(),n=t.firstChild,r=e.onSetRef;return typeof r==`function`?H(r,t):e.onSetRef=t,N(n,()=>e.title),A(r=>{var i={"home-session-group-header z-[5]":!!e.elevated,"z-10":!e.elevated},a=e.titleOpacity;return r.e=F(t,i,r.e),a!==r.t&&R(n,`opacity`,r.t=a),r},{e:void 0,t:void 0}),t})()}';

const SAMPLE_SOURCE = `/* prefix */ ${ORIGINAL_PM} ${ORIGINAL_GG} /* suffix */`;

function makeRecords() {
  return [
    {
      session: { id: "s1", projectID: "p1", location: { directory: "C:\\Users\\HP" }, time: { updated: 100 } },
      project: { id: "p1", worktree: "C:\\Users\\HP" },
      projectName: "HP",
    },
    {
      session: { id: "s2", projectID: "p1", location: { directory: "C:\\Users\\HP" }, time: { updated: 300 } },
      project: { id: "p1", worktree: "C:\\Users\\HP" },
      projectName: "HP",
    },
    {
      session: { id: "s3", projectID: "p2", location: { directory: "D:\\work\\RAS" }, time: { updated: 200 } },
      project: { id: "p2", worktree: "D:\\work\\RAS" },
      projectName: "RAS",
    },
  ];
}

module.exports = { ORIGINAL_PM, SAMPLE_SOURCE, makeRecords };
