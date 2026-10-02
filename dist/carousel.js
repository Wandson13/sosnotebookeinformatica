(()=>{
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function advance(box,step){const slides=[...box.querySelectorAll('.carousel-slide')];if(slides.length<2)return;const index=(Number(box.dataset.index||0)+step+slides.length)%slides.length;box.dataset.index=String(index);slides.forEach((slide,i)=>{slide.hidden=i!==index});box.querySelectorAll('[data-slide-index]').forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));box.dataset.changed=String(Date.now())}
document.addEventListener('click',e=>{const button=e.target.closest('[data-slide-index]');if(!button)return;const box=button.closest('[data-carousel]');advance(box,Number(button.dataset.slideIndex)-Number(box.dataset.index||0))});
document.addEventListener('keydown',e=>{const box=e.target.closest?.('[data-carousel]');if(box&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();advance(box,e.key==='ArrowLeft'?-1:1)}});
const timer=setInterval(()=>{if(document.hidden||reduced.matches)return;document.querySelectorAll('[data-carousel]').forEach(box=>{if(box.dataset.paused==='true'||box.matches(':hover')||box.contains(document.activeElement)||Date.now()-Number(box.dataset.changed||0)<Number(box.dataset.duration||4000))return;const r=box.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)advance(box,1)})},1000);
window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
