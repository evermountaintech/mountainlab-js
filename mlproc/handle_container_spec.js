#!/usr/bin/env node

const sha1=require('node-sha1');
const common=require(__dirname+'/common.js');

function print_usage() {
  console.info('test_spec.js spec [container path]');
}

let CLP=new CLParams(process.argv);
let arg1=CLP.unnamedParameters[0];
let container_path=CLP.unnamedParameters[1];

if ((arg1!='spec')||(!container_path)) {
  print_usage();
  process.exit(-1);
}

async function main() {
  if (arg1=='spec') {
    let image_fname=await download_container_if_needed(container_path);

    //let cmd=`singularity exec --contain ${image_fname} env | grep ML`;
    let cmd=`singularity exec --contain ${image_fname} ml-spec`;
    //let args=['exec','--contain',image_fname,'ml-spec'];
    let result=await run_process(cmd,{});
    if (result.exit_code!=0) {
      console.error(`Non-zero exit code (${result.exit_code}) when calling: `+cmd);
      process.exit(result.exit_code);  
    }
    let spec;
    try {
      spec=JSON.parse(result.stdout.trim());
    }
    catch(err) {
      console.error(result.stdout.trim());
      console.error('Error parsing spec.');
      process.exit(-1);
    }
    let processors=spec.processors||[];
    for (let i in processors) {
      let P=processors[i];
      // TODO: bind the temporary directory
      P.exe_command='singularity exec --contain $(singularity_bind) '+image_fname+' '+P.exe_command;
    }
    console.info(JSON.stringify(spec,null,4));
  }
  else {
    console.error('Unrecognized command: '+arg1);
    process.exit(-1);
  }
}
main();


async function run_process(cmd,opts) {
  let ret={
    exit_code:null,
    stdout:'',
    stderr:''
  }
  if (!opts) opts={};
  return new Promise(function(resolve,reject) {
    let P_opts={shell:true};
    if (opts.cwd) {
      P_opts.cwd=opts.cwd;
    }
    P_opts.env={};

    /////////////////////////////////////////////
    // It is really unfortunate that I need to strip the environment
    // variables that begin with ML_ -- what a terrible hack
    // This is because those environment variables seem to survive
    // in the Singularity container. Terrible!
    for (let key in process.env) {
      if (!key.startsWith('ML_')) {
        P_opts.env[key]=process.env[key];
      }
    }
    /////////////////////////////////////////////

    let P;
    try {
      P=require('child_process').spawn(cmd,P_opts);
    }
    catch(err) {
      console.error(err.message);
      reject('Error running: '+cmd);
      return;
    }
    P.stdout.on('data',function(chunk) {
      chunk=chunk.toString();
      ret.stdout+=chunk;
    });
    P.stderr.on('data',function(chunk) {
      chunk=chunk.toString();
      console.error(chunk);
      ret.stderr+=chunk;
    });
    P.on('close',function(code) {
      ret.exit_code=code;
      resolve(ret);
    });
  });  
}

function ends_with(str,str2) {
    return (str.slice(str.length-str2.length)==str2);
}

async function download_container_if_needed(path) {
  if (path.startsWith('shub://')) {
    let workdir=common.shub_cache_directory();
    let fname=sha1(path)+'.simg';
    if (require('fs').existsSync(workdir+'/'+fname)) {
      return workdir+'/'+fname;
    }
    let result=await run_process(`singularity pull --name ${fname} ${path}`,{cwd:workdir});
    if (result.exit_code!=0) {
      console.error(result.stderr);
      console.error('Error downloading container.');
      process.exit(-1);
    }
    return workdir+'/'+fname;
  }
  else if (ends_with(path,'.simg')) {
    return path;
  }
  else {
    console.error('Unsupported container path: '+path);
    process.exit(-1);
  }
}

function CLParams(argv) {
  this.unnamedParameters=[];
  this.namedParameters={};

  var args=argv.slice(2);
  for (var i=0; i<args.length; i++) {
    var arg0=args[i];
    if (arg0.indexOf('--')===0) {
      arg0=arg0.slice(2);
      var ind=arg0.indexOf('=');
      if (ind>=0) {
        this.namedParameters[arg0.slice(0,ind)]=arg0.slice(ind+1);
      }
      else {
        this.namedParameters[arg0]=args[i+1]||'';
        i++;
      }
    }
    else if (arg0.indexOf('-')===0) {
      arg0=arg0.slice(1);
      this.namedParameters[arg0]='';
    }
    else {
      this.unnamedParameters.push(arg0);
    }
  }
}