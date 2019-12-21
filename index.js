const Client = require('ftp');
const fs = require("fs");
const path = require('path');

const catalogJsonFileName = 'catalog.json';

function generateCatalog(dirPath, rootPath) {
    let fileList = [];
    try {
        let files = fs.readdirSync(dirPath);
        files.forEach(function (filename) {
            let filedir = path.join(dirPath, filename);
            try {
                let stats = fs.statSync(filedir);
                let isFile = stats.isFile();
                let isDir = stats.isDirectory();
                if (isFile) {
                    fileList.push(filedir.substr(rootPath.length + 1, filedir.length - rootPath.length))
                }
                if (isDir) {
                    fileList = fileList.concat(generateCatalog(filedir, rootPath));
                }
            } catch (err) {
                console.trace(err);
            }
        });

    } catch (error) {
        fileList = [];
    }
    return fileList
}

function uploadFTPFile(client, localPath, destPath) {
    return new Promise((resolve, reject) => {
        client.put(localPath, destPath, false, (error) => {
            if (error) {
                reject({
                    localPath,
                    destPath,
                    error
                })
            } else {
                resolve({localPath, destPath});
            }
        })
    })
}

function ftpMkdir(client, ftpDirPath) {
    return new Promise((resolve, reject) => {
        client.mkdir(ftpDirPath, true, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(ftpDirPath)
            }
        })
    })
}

function getFTPCatalogJSON  (client,catalogFilePath) {
    return new Promise((resolve, reject) => {
        console.log(`哈哈`,catalogFilePath)
        client.get(catalogFilePath, (error, stream) => {
            if (error) {
                resolve([]);
            } else {
                let chunks = [];
                let chunksSize = 0
                stream.on('data', (chunk) => {
                    chunks.push(chunk);
                    chunksSize += chunk.length;
                });
                stream.on('end', () => {
                    let data = Buffer.concat(chunks, chunksSize).toString();
                    resolve(JSON.parse(data));
                })

            }
        })
    })
}

function ftpDeleteFile(client,filePath){
    return new Promise((resolve, reject) => {
        client.delete(filePath, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(filePath)
            }
        })
    })
}

async function uploadBuildFilesToFTP(client, localDirPath, ftpDirPath,ignoreFilePaths) {

    try {
        let files = fs.readdirSync(localDirPath);
        for (let i = 0; i < files.length; i++) {
            let filename = files[i];
            let filePath = path.join(localDirPath, filename);
            let ftpFilePath = path.join(ftpDirPath, filename);
            try {
                let stats = fs.statSync(filePath)
                let isFile = stats.isFile();
                let isDir = stats.isDirectory();
                if (isFile) {
                    if(!ignoreFilePaths || !ignoreFilePaths.length || ignoreFilePaths.indexOf(filePath) < 0){
                        console.log(`[INFO] Uploading :`);
                        console.log("from: ",filePath);
                        console.log("to: ",ftpFilePath);
                        await uploadFTPFile(client, filePath, ftpFilePath,ignoreFilePaths);
                    }

                }
                if (isDir) {
                    await ftpMkdir(client, ftpFilePath);
                    await uploadBuildFilesToFTP(client, filePath, ftpFilePath)
                }
            } catch (err) {
                console.trace(err)
                throw err
            }
        }

    } catch (error) {
        console.trace(error)
        throw error
    }
}

class Publisher {
    constructor(config) {
        let {ftp, targetPath, destPath, indexFileName, catalogFileName} = config || {};

        if (!ftp || typeof ftp !== 'object') {
            throw new Error(`️No found 'ftp' parameter in 'config'.
             'ftp' is  ftp server configuration object,it's required.
             The FTP configuration document is linked here : https://github.com/mscdex/node-ftp#methods`)
        }
        if(!targetPath){
              throw new Error(`️ No found 'targetPath' parameter in 'config'.
             'targetPath'  is the absolute path to  the web app build directory ,it's required.`)
        }
        this.config = {
            ftp, targetPath, destPath, indexFileName, catalogFileName
        };

    }

    async ftpClientOnReady(client) {
        let oldCatalog = null;

        try {
            console.log(`[INFO] Retrieving previous directory record json file from the FTP server`);
            let catalogName = this.config.catalogFileName ? this.config.catalogFileName + ".json" : catalogJsonFileName
            let catalogDestFilePath =  this.config.destPath ? path.join(this.config.destPath,catalogName):catalogName;
            oldCatalog = await getFTPCatalogJSON(client,catalogDestFilePath)
            console.log(`[INFO] Previous directory record file list:`);
            console.table(oldCatalog);
        } catch (e) {
            console.trace(e);
        }
        if(this.config.destPath && this.config.destPath !== "/"){
            try{
                await ftpMkdir(client, this.config.destPath);
            }catch(e){
                console.error(`Unable to create directory:${this.config.destPath}  `);
                console.error(`Publish failed, mission aborted!`);
                client.end();
                return
            }
        }

        try{
            console.log(`[INFO] Start uploading`);
            await uploadBuildFilesToFTP(client, this.config.targetPath, this.config.destPath  || "",[path.join(this.config.targetPath , this.config.indexFileName || "index.html")]);
        }catch(e){
            console.error(e);
            console.error(`File upload failed! Publish failed, mission aborted!`);
            client.end();
            return
        }
        console.log(`[INFO] Start uploading ${ this.config.indexFileName ||  "index.html"}`);
        let isIndexFileExist = true;
        let indexFilePath =  path.join(this.config.targetPath , this.config.indexFileName ||  "index.html");
        try{
            let indexStat = fs.statSync(indexFilePath);
        }catch(e){
            isIndexFileExist = false;
        }
        if(isIndexFileExist){
            try{
                await  uploadFTPFile(client,indexFilePath,this.config.indexFileName || "index.html");
            }catch (e) {
                console.error(e);
                console.error(`File upload '${this.config.indexFileName || "index.html"}' failed! Publish failed, mission aborted!`);
                client.end();
                return
            }
        }

        console.log(`[INFO] Uploaded All Files!`);
        console.log(`[INFO] Cleaning up discarded files...`);
        let catalogFileName = this.config.catalogFileName ?  this.config.catalogFileName + ".json" :catalogJsonFileName
        let newCatalog = fs.readFileSync(path.join(this.config.targetPath,catalogFileName)  ,'utf8');
        newCatalog = newCatalog ? JSON.parse(newCatalog):null;
        if(!newCatalog || !newCatalog.length){
            console.warn(`⚠️  [WARNING]  Unable to clean up the file.The new record file cannot be parsed correctly`);
            console.log('[END] Published.Done.Bye!');
            client.end();
        }else   if(!oldCatalog || !oldCatalog.length){
            console.warn(`⚠️  [WARNING]  Unable to clean up the file.The previous record file cannot be parsed correctly`);
            console.log('[END] Published.Done.Bye!');
            client.end();
        }else {
            let hasOldFile = false;
            let catalog =  this.config.catalogFileName || catalogJsonFileName
            for(let path of oldCatalog){
                if(path !== catalog && newCatalog.indexOf(path) < 0){
                    hasOldFile = true
                    try{
                        console.log(`[INFO] Deleting ftp file: ${path}`);
                        await ftpDeleteFile(client,path);
                    }catch (e) {
                        console.log(`⚠️  [WARNING] Fail to deleting ftp file: ${path}`);
                    }
                }
            }
            if(!hasOldFile){
                console.log(`[INFO] No found discarded files!`);
            }
            console.log(`[INFO] Clean up discarded files!`);
            console.log('[END] Published.Done.Bye!');
            client.end();
        }



    }

    async  resume() {
        console.log(`[INFO] Generating the target directory record json file...`);
        let catalog = generateCatalog(this.config.targetPath, this.config.targetPath);
        console.log(`[INFO] The target directory  file list :`)
        console.table(catalog);
        let catalogFileName = this.config.catalogFileName ? this.config.catalogFileName + ".json" :catalogJsonFileName
        let catalogPath = path.join(this.config.targetPath, catalogFileName);
        let str = JSON.stringify(catalog, null, "\t")
        try {
            console.log(`[INFO] Writing ${catalogFileName} to  the target directory`);
            fs.writeFileSync(catalogPath, str);
        } catch (e) {
            console.error(`[ERROR] Error writing ${catalogFileName} to  the target directory`);
            throw e;
        }
        console.log(`[INFO] Generated the target directory record json file`);

        let client = new Client();
        let onReady = () => {
            console.log(`[INFO] Connected FTP Server!`)
            this.ftpClientOnReady(client);
        };
        client.on('ready', onReady);
        client.on(`error`, function (error) {
            console.error(`[ERROR] Failure! FTP Server Connection Error!`)
            throw error;
        })
        client.connect(this.config.ftp);
        console.log(`[INFO] Connecting FTP Server...`)
    }

}

module.exports = Publisher;
