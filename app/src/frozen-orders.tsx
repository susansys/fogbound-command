import type {PlayerView} from './contracts';
import {clock} from './player-copy';

export function FrozenOrders({orders}:{orders:PlayerView['issued_orders']}){
  return <section className="frozen-orders" data-testid="frozen-command"><h3>已签发任务</h3>{orders.map(order=><article key={order.command_id}>
    <p>总部签发 {clock(order.issued)} · 原指令内容已保留</p>
    <p>{'kind' in order.plan?'记录组 R · 工位 H · 记录档案 A':'联络组 R · 联络点 T · 固定通道通行'}</p>
    <h4>原始指挥意图</h4><p className="frozen-reason">{order.reason===undefined||order.reason===''?'未填写':order.reason}</p>
    <small>依据当时登记的指令和理由；后续回报不会改写原始意图。</small>
  </article>)}</section>;
}
