// Only bundled into Node DOM tests. Never imported by application code.
export const fixtureSource = `
const state=window.serviceFixture={
  profiles:[{id:'fixture-admin',full_name:'Admin Uji',role:'admin'},{id:'fixture-guru',full_name:'Guru Uji',role:'guru'},{id:'fixture-murid',full_name:'Murid Uji',role:'murid'}],
  classes:[{id:'fixture-class',name:'Kelas Uji Awal',teacher_id:'fixture-guru'}],
  memberships:[{class_id:'fixture-class',student_id:'fixture-murid'}],attempts:[]
};
export const configured=true;
export const loginEmail=value=>value.trim().toLowerCase();
export const db={auth:{
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
  const p={id:crypto.randomUUID(),full_name:values.full_name,role:values.role};state.profiles.push(p);
  if(values.class_id)state.memberships.push({class_id:values.class_id,student_id:p.id});
}
export async function changeRole(user,id,role){state.profiles.find(p=>p.id===id).role=role;}
export async function saveAttempt(user,detail){state.attempts.push({...detail,student_id:user.id,created_at:new Date().toISOString()});}
`;
