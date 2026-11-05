import {field,number,type Value} from './graph.ts';
import {P,fillToCss} from './styles.ts';
/** Native page/panel image repeat and alignment, expressed as a CSS background. */
export function nativeBackground(props:Map<number,Value>,asset:(value:Value|undefined)=>string|undefined):string {
 const color=fillToCss(props.get(P.FILL)),image=asset(props.get(P.IMAGE));if(!image)return color;
 const alignment=props.get(P.IMAGE_ALIGNMENT),x=['left','center','right'][number(field(alignment,'HorizontalAlignment'))]??'left',y=['top','center','bottom'][number(field(alignment,'VerticalAlignment'))]??'top',repeat=number(props.get(P.IMAGE_REPEAT));
 const mode=['no-repeat','repeat','repeat-x','repeat-y','no-repeat','no-repeat','no-repeat'][repeat]??'no-repeat',size=repeat===4?'cover':repeat===5?'contain':repeat===6?'100% 100%':'auto';
 return `${color} url("${image}") ${x} ${y} / ${size} ${mode}`;
}
