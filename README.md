Description
===========

With FTP Server,publish the build files of ReactJS App and VueJS App to the web server target directory.The advantages are as follows:

   *  No residual history files.During the publishing , The catalog json of the current version  will be generated . Files that are no longer referenced in the current version will be deleted after uploaded.
    
 * Optimize the publish order of files. To prevent online users from accessing your web application, the specified  entry file (such as: index.html) will be uploaded last

Install
=======

    npm i web-app-ftp-publish


Examples
========

* Publish new build files to FTP Directory:

```javascript
 const Publisher = require(`web-app-ftp-publish`);
 const path = require('path');
 
 
 let publisher = new Publisher({
     ftp:{
         host: "",
         port: "",
         user: "",
         password: "",
     }, // Required.Ftp configuration object. The FTP configuration document is linked here : https://github.com/mscdex/node-ftp#methods
     targetPath: path.resolve(__dirname + "/./build"), // Required. the absolute path of  the  build directory
     indexFileName:"index.html", // Optional.  Build directory's  index filename . default 'index.html'
     destPath:"/react/build", // Optional. The ftp destination directory. default "/',ftp server root  directory
     catalogFileName:"build-dir-catalog" //Optional . Catalog json file name.default 'catalog.json'
 });
 
 publisher.resume();
```
Configuration
-------

* **ftp**  - Required.Ftp configuration object. The FTP configuration document is linked here : [https://github.com/mscdex/node-ftp#methods](https://github.com/mscdex/node-ftp#methods)

* **targetPath** - Required. the absolute path of  the  build directory

* **indexFileName**  - Optional.  Build directory's  index filename . default 'index.html'.

* **destPath**  -  Optional. The ftp destination directory. default "/',ftp server root  directory.

* **catalogFileName**  - Optional . Catalog json file name.default 'catalog.json'


>  Reminder: The tool uses FTP Passive mode for uploading. If connecting/uploading timeout, please check whether the server has enough ports available for FTP upload.

Methods
-------

* **resume**() _(void)_  .




