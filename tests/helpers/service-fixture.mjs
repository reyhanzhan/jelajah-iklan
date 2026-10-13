// Only bundled into Node DOM tests. Never imported by application code.
export const fixtureSource = `
const state=window.serviceFixture={
  profiles:[{id:'fixture-admin',full_name:'Admin Uji',role:'admin',email:'admin@fixture.test'},{id:'fixture-guru',full_name:'Guru Uji',role:'guru',email:'guru@fixture.test'},{id:'fixture-murid',full_name:'Murid Uji',role:'murid',email:'murid@fixture.test'}],
  classes:[{id:'fixture-class',name:'Kelas Uji Awal',teacher_id:'fixture-guru'}],
  memberships:[{class_id:'fixture-class',student_id:'fixture-murid'}],attempts:[]
};
export const configured=true;
export const loginEmail=value=>value.trim().toLowerCase();
export const db={
  async rpc(name, args){
    state.content ||= {id:crypto.randomUUID(),data:window.getLearningDefaults()};
    if(name==='get_learning_content')return {data:JSON.parse(JSON.stringify(state.content))};
    if(name==='delete_learning_item'||name==='save_learning_settings'){
      if(args.expected_revision!==state.content.id)return {error:{message:'Konten sudah diubah pengajar lain.'}};
      if(name==='delete_learning_item')state.content.data[args.content_kind].splice(args.item_index,1);
      else state.content.data.settings={adCount:args.ad_count};
      state.content.id=crypto.randomUUID();return {data:JSON.parse(JSON.stringify(state.content))};
    }
    if(name==='save_learning_item'){
      if(args.expected_revision!==state.content.id)return {error:{message:'Konten sudah diubah pengajar lain. Muat ulang.'}};
      const items=state.content.data[args.content_kind];
      if(args.item_index===null)items.push(args.item_data);else items[args.item_index]=args.item_data;
      state.content.id=crypto.randomUUID();
      return {data:JSON.parse(JSON.stringify(state.content))};
    }
    if(name==='submit_learning_essay'){state.essayAnswers=args.responses;return {};}
  },
  auth:{
  getSession:async()=>({data:{session:null}}),
  onAuthStateChange:callback=>{state.listener=callback;},
  async signInWithPassword({email,password}){
    const profile=state.profiles.find(p=>email===p.role+'@fixture.test');
    if(!profile||password!=='test-password-only')return {error:new Error('Invalid credentials')};
    return {data:{user:{id:profile.id}}};
  },
  async signOut(){state.listener('SIGNED_OUT');return {};}
}};
export const profileFor=async id=>state.profiles.find(p=>p.id===id);
export const dashboard=async()=>state;
export async function createClass(user,name){state.classes.push({id:crypto.randomUUID(),name,teacher_id:user.id});}
export async function createAccount(user,values){
  if(values.action==='update'){Object.assign(state.profiles.find(p=>p.id===values.id),{full_name:values.full_name,email:values.email});return;}
  if(values.action==='delete'){state.profiles=state.profiles.filter(p=>p.id!==values.id);state.memberships=state.memberships.filter(m=>m.student_id!==values.id);return;}
  const p={id:crypto.randomUUID(),full_name:values.full_name,email:values.email,role:values.role};state.profiles.push(p);
  if(values.class_id)state.memberships.push({class_id:values.class_id,student_id:p.id});
}
export async function manageClass(values){
  if(values.action==='delete'){state.classes=state.classes.filter(c=>c.id!==values.target_id);state.memberships=state.memberships.filter(m=>m.class_id!==values.target_id);return;}
  const classroom=state.classes.find(c=>c.id===values.target_id);classroom.name=values.class_name;if(values.new_teacher_id)classroom.teacher_id=values.new_teacher_id;
}
export async function changeRole(user,id,role){state.profiles.find(p=>p.id===id).role=role;}
export async function saveAttempt(user,detail){state.attempts.push({...detail,student_id:user.id,created_at:new Date().toISOString()});}
`;
