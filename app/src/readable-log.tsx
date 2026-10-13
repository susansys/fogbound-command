import type {LogEntry} from './contracts';
import {Dialog} from './dialog';
import {activity_copy,clock,log_copy} from './player-copy';

function sender(entry:LogEntry,record:boolean){
  return entry.sender??(['issued','sent'].includes(entry.kind)?'总部指挥席':entry.kind==='report'?'联络席':record?'记录组 R':'联络组 R');
}
export function RecordSummary({entry,record,onDetails}:{entry:LogEntry;record:boolean;onDetails:(entry:LogEntry)=>void}){
  return <div className="log-record"><time>{clock(entry.at)}</time><span>{sender(entry,record)}</span><p>{log_copy(entry)}</p><small data-activity-reference={entry.activity_id}>{entry.activity_id?'活动凭证':'回报'}</small><button onClick={()=>onDetails(entry)}>凭证详情</button></div>;
}
export function RecordDetail({entry,record,onClose}:{entry:LogEntry;record:boolean;onClose:()=>void}){
  return <Dialog title="记录详情" onClose={onClose}><div className="dialog-body record-detail">
    <p>{log_copy(entry)}</p><dl><dt>发件人</dt><dd>{sender(entry,record)}</dd><dt>观察时间</dt><dd>{entry.observed===undefined?'未提供':clock(entry.observed)}</dd><dt>{['issued','sent'].includes(entry.kind)?'总部登记时间':'总部收到'}</dt><dd>{clock(entry.at)}</dd><dt>凭证</dt><dd>{activity_copy(entry)}</dd>{entry.activity_id&&<><dt>活动凭证编号</dt><dd>{entry.activity_id}</dd></>}<dt>已有记录引用</dt><dd>{entry.evidence}</dd></dl>
  </div></Dialog>;
}
