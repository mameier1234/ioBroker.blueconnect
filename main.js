
'use strict';


const utils = require('@iobroker/adapter-core');
const request = require("request");
const crypto = require('crypto-js');
const fs = require('fs');


class Blueconnect extends utils.Adapter {
    
    constructor(options) {
        super({
            ...options,
            name: 'blueconnect',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        var bc = this;
        
        var email = bc.config.email;
        var password = bc.config.password;

	var language = 'de';
        
        function createObj(id, name, type) {
            bc.setObjectNotExists(id, {
                type: 'state',
                common: {
                    name: name,
                    type: type,
                    role: 'value',
                    read: true,
                    write: false,
                },
                native: {},
            });
        }


        
        function setValue(id, value) {
            bc.setState(id, {val: value, ack: true});
        }
        
        function process(key,value, index, device) {
	    var name = /[^.]*$/.exec(key)[0];

            if(index!=='') {
                key = index + "." + key;
            }
	    if(device!=='') {
    		key = device + "." + key;
	    }
            createObj(key, name, typeof(value));
            setValue(key, value);
        }

        function getSignatureKey(Crypto, key, dateStamp, regionName, serviceName) {
            var kDate = Crypto.HmacSHA256(dateStamp, "AWS4" + key);
            var kRegion = Crypto.HmacSHA256(regionName, kDate);
            var kService = Crypto.HmacSHA256(serviceName, kRegion);
            var kSigning = Crypto.HmacSHA256("aws4_request", kService);
            return kSigning;
        }

        function getAmzDate(dateStr) {
            var chars = [":","-"];
            for (var i=0;i<chars.length;i++) {
                while (dateStr.indexOf(chars[i]) != -1) {
                    dateStr = dateStr.replace(chars[i],"");
                }
            }
            dateStr = dateStr.split(".")[0] + "Z";
            return dateStr;
        }

        
        function getMeasurements(access_key, secret_key, session_token, poolID, blueConnectKey) {
            var myMethod = 'GET';
            var myPath = '/prod/swimming_pool/' + poolID + '/blue/' + blueConnectKey + '/lastMeasurements';
            
	    var region = 'eu-west-1';
            var myService = 'execute-api';
            
            var amzDate = getAmzDate(new Date().toISOString());
            var authDate = amzDate.split("T")[0];
            var payload = '';
            var hashedPayload = crypto.SHA256(payload).toString();

            var canonicalReq =  myMethod + '\n' +
                                myPath + '\n' +
                                'mode=blue_and_strip\n' +
                                'accept-encoding:gzip;q=1.0,compress;q=0.5\n' +
                                'accept-language:de-DE;q=1.0\n' +
                                'host:api.riiotlabs.com\n' +
                                'user-agent:aws-sdk-iOS/2.4.6 iOS/13.1 de_DE\n' +
                                'x-amz-date:' + amzDate + '\n' +
                                'x-amz-security-token:' + session_token + '\n' + 
                                '\n' +
                                'accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token' + '\n' +
                                hashedPayload;

            var canonicalReqHash = crypto.SHA256(canonicalReq).toString();
            var stringToSign =  'AWS4-HMAC-SHA256\n' +
                                amzDate + '\n' +
                                authDate+'/'+region+'/'+myService+'/aws4_request\n'+
                                canonicalReqHash;

            var signingKey = getSignatureKey(crypto, secret_key, authDate, region, myService);
            var authKey = crypto.HmacSHA256(stringToSign, signingKey);

            var authString  = 'AWS4-HMAC-SHA256 ' +
                              'Credential='+
                              access_key+'/'+
                              authDate+'/'+
                              region+'/'+
                              myService+'/aws4_request,'+
                              'SignedHeaders=accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token '+
                              'Signature='+authKey;

            var requestOptions = {
                'method': 'GET',
		'gzip': true,
		'uri': 'https://api.riiotlabs.com/prod/swimming_pool/' + poolID + '/blue/' + blueConnectKey + '/lastMeasurements?mode=blue_and_strip',
                headers: {
                    'accept-encoding': 'gzip;q=1.0,compress;q=0.5',
                    'accept-language': 'de-DE;q=1.0',
                    'host': 'api.riiotlabs.com',
                    'user-agent': 'aws-sdk-iOS/2.4.6 iOS/13.1 de_DE',
                    'x-amz-date': amzDate,
                    'x-amz-security-token': session_token,
                    'authorization': authString
                }
            };

            request.get(requestOptions, function(error, response, body) {
                var result = JSON.parse(body);
		//bc.log.debug("getMeasurements():");
                //bc.log.debug(body);

                for(var el in result) {
                    if(typeof(result[el])=="string") {
                        process(el, result[el], "", poolID);
			//bc.log.debug(el+ " : " + result[el]);
                    }
                }

                for(var el in result["data"]) {
                    //createObj(poolID + "." + result["data"][el]["name"], result["data"][el]["name"], "");
                    for(var value in result["data"][el]) {
                        if(typeof(result["data"][el][value])!=="object") {
                            process(value, result["data"][el][value], result["data"][el]["name"], poolID);
			    //bc.log.debug(value + " : " + result["data"][el][value]);
                        }
                    }
                }

            });
        }
		
        function getGuidance(access_key, secret_key, session_token, poolID, blueConnectKey) {
            var myMethod = 'GET';
            var myPath = '/prod/swimming_pool/' + poolID + '/guidance';
            
			var region = 'eu-west-1';
            var myService = 'execute-api';
            
            var amzDate = getAmzDate(new Date().toISOString());
            var authDate = amzDate.split("T")[0];
            var payload = '';
            var hashedPayload = crypto.SHA256(payload).toString();

			var hasIssues = false;
			var hasExpiration = false;
			var hasStarted = false;
			

            var canonicalReq =  myMethod + '\n' +
                                myPath + '\n' +
                                'lang=' + language +
				'&mode=interactive_v03\n' +
                                'accept-encoding:gzip;q=1.0,compress;q=0.5\n' +
                                'accept-language:de-DE;q=1.0\n' +
                                'host:api.riiotlabs.com\n' +
                                'user-agent:aws-sdk-iOS/2.4.6 iOS/13.1 de_DE\n' +
                                'x-amz-date:' + amzDate + '\n' +
                                'x-amz-security-token:' + session_token + '\n' + 
                                '\n' +
                                'accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token' + '\n' +
                                hashedPayload;

            var canonicalReqHash = crypto.SHA256(canonicalReq).toString();
            var stringToSign =  'AWS4-HMAC-SHA256\n' +
                                amzDate + '\n' +
                                authDate+'/'+region+'/'+myService+'/aws4_request\n'+
                                canonicalReqHash;

            var signingKey = getSignatureKey(crypto, secret_key, authDate, region, myService);
            var authKey = crypto.HmacSHA256(stringToSign, signingKey);

            var authString  = 'AWS4-HMAC-SHA256 ' +
                              'Credential='+
                              access_key+'/'+
                              authDate+'/'+
                              region+'/'+
                              myService+'/aws4_request,'+
                              'SignedHeaders=accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token '+
                              'Signature='+authKey;

            var requestOptions = {
                'method': 'GET',
		'gzip': true,
		'uri': 'https://api.riiotlabs.com/prod/swimming_pool/' + poolID + '/guidance?lang=' + language + '&mode=interactive_v03',
                headers: {
                    'accept-encoding': 'gzip;q=1.0,compress;q=0.5',
                    'accept-language': 'de-DE;q=1.0',
                    'host': 'api.riiotlabs.com',
                    'user-agent': 'aws-sdk-iOS/2.4.6 iOS/13.1 de_DE',
                    'x-amz-date': amzDate,
                    'x-amz-security-token': session_token,
                    'authorization': authString
                }
            };

            request.get(requestOptions, function(error, response, body) {
                var result = JSON.parse(body);
                //bc.log.debug(body);

                for(var el in result["guidance"]) {
                    if(typeof(result["guidance"][el])=="string") {
						//bc.log.debug(el + ' : ' + result["guidance"][el]);
                        //process(el, result["guidance"][el], "", poolID);
						createObj(poolID + ".guidance." + el, el, typeof(result["guidance"][el]));
						process(poolID + ".guidance." + el, result["guidance"][el],"", "");
						if(el=="expiration_time") hasExpiration = true;
						if(el=="start_date") hasStarted = true;
                    } else {
						if(el=="issue_to_fix") {
							for(var issue in result["guidance"][el]) {
								if(typeof(result["guidance"][el][issue])=="string") {
									//bc.log.debug(issue + ' : ' + result["guidance"][el][issue]);
									createObj(poolID + ".guidance.issue." + issue, issue, typeof(result["guidance"][el][issue]));
									process(poolID + ".guidance.issue." + issue, result["guidance"][el][issue],"", "");
									hasIssues = true;
								}
							}
						} else {
							bc.log.debug("Node ignored: " + el);
						}
					}
                }

	    if(!hasIssues) {
			//bc.log.debug("clearing issue for Pool " + poolID);
			process(poolID + ".guidance.issue.action_title", "", "", "");
			process(poolID + ".guidance.issue.chemicalPackId", "", "", "");
			process(poolID + ".guidance.issue.issue_title", "", "", "");
			process(poolID + ".guidance.issue.task_identifier", "", "", "");
			process(poolID + ".guidance.issue.user_action", "", "", "");
	    }
		
		if(!hasExpiration) {
			//bc.log.debug("clearing expiration for Pool " + poolID);
			process(poolID + ".guidance.expiration_time", "", "", "");
		}
		
		if(!hasStarted) {
			//bc.log.debug("clearing issue start date for Pool " + poolID);
			process(poolID + ".guidance.start_date", "", "", "");
		}



            });
        }

        function getFeed(access_key, secret_key, session_token, poolID, blueConnectKey) {
            var myMethod = 'GET';
            var myPath = '/prod/swimming_pool/' + poolID + '/feed';
            
	    var region = 'eu-west-1';
            var myService = 'execute-api';
            
            var amzDate = getAmzDate(new Date().toISOString());
            var authDate = amzDate.split("T")[0];
            var payload = '';
            var hashedPayload = crypto.SHA256(payload).toString();

	    

            var canonicalReq =  myMethod + '\n' +
                                myPath + '\n' +
                                'lang=' + language +
				'\n' +
                                'accept-encoding:gzip;q=1.0,compress;q=0.5\n' +
                                'accept-language:de-DE;q=1.0\n' +
                                'host:api.riiotlabs.com\n' +
                                'user-agent:aws-sdk-iOS/2.4.6 iOS/13.1 de_DE\n' +
                                'x-amz-date:' + amzDate + '\n' +
                                'x-amz-security-token:' + session_token + '\n' + 
                                '\n' +
                                'accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token' + '\n' +
                                hashedPayload;

            var canonicalReqHash = crypto.SHA256(canonicalReq).toString();
            var stringToSign =  'AWS4-HMAC-SHA256\n' +
                                amzDate + '\n' +
                                authDate+'/'+region+'/'+myService+'/aws4_request\n'+
                                canonicalReqHash;

            var signingKey = getSignatureKey(crypto, secret_key, authDate, region, myService);
            var authKey = crypto.HmacSHA256(stringToSign, signingKey);

            var authString  = 'AWS4-HMAC-SHA256 ' +
                              'Credential='+
                              access_key+'/'+
                              authDate+'/'+
                              region+'/'+
                              myService+'/aws4_request,'+
                              'SignedHeaders=accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token '+
                              'Signature='+authKey;

            var requestOptions = {
                'method': 'GET',
		'gzip': true,
		'uri': 'https://api.riiotlabs.com/prod/swimming_pool/' + poolID + '/feed?lang=' + language,
                headers: {
                    'accept-encoding': 'gzip;q=1.0,compress;q=0.5',
                    'accept-language': 'de-DE;q=1.0',
                    'host': 'api.riiotlabs.com',
                    'user-agent': 'aws-sdk-iOS/2.4.6 iOS/13.1 de_DE',
                    'x-amz-date': amzDate,
                    'x-amz-security-token': session_token,
                    'authorization': authString
                }
            };

            request.get(requestOptions, function(error, response, body) {
                var result = JSON.parse(body);
                //bc.log.debug(body);

                for(var el in result["data"][0]) {
                    if(typeof(result["data"][0][el])=="string") {
			//bc.log.debug(el + ' : ' + result["data"][0][el]);
			createObj(poolID + ".feed." + el, el, typeof(result["data"][0][el]));
			process(poolID + ".feed." + el, result["data"][0][el],"", "");
                    }
                }
            });
        }


	function getPool(access_key, secret_key, session_token) {
	    var poolIDs = [];
            var myMethod = 'GET';
            var myPath = '/prod/swimming_pool'; //swimming_pool
            var region = 'eu-west-1';
            var myService = 'execute-api';
            
            var amzDate = getAmzDate(new Date().toISOString());
            var authDate = amzDate.split("T")[0];
            var payload = '';
            var hashedPayload = crypto.SHA256(payload).toString();

            var canonicalReq =  myMethod + '\n' +
                                myPath + '\n' +
                                'deleted=false\n' +
                                'accept-encoding:gzip;q=1.0,compress;q=0.5\n' +
                                'accept-language:de-DE;q=1.0\n' +
                                'host:api.riiotlabs.com\n' +
                                'user-agent:aws-sdk-iOS/2.4.6 iOS/13.1 de_DE\n' +
                                'x-amz-date:' + amzDate + '\n' +
                                'x-amz-security-token:' + session_token + '\n' + 
                                '\n' +
                                'accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token' + '\n' +
                                hashedPayload;

            var canonicalReqHash = crypto.SHA256(canonicalReq).toString();
            var stringToSign =  'AWS4-HMAC-SHA256\n' +
                                amzDate + '\n' +
                                authDate+'/'+region+'/'+myService+'/aws4_request\n'+
                                canonicalReqHash;

            var signingKey = getSignatureKey(crypto, secret_key, authDate, region, myService);
            var authKey = crypto.HmacSHA256(stringToSign, signingKey);

            var authString  = 'AWS4-HMAC-SHA256 ' +
                              'Credential='+
                              access_key+'/'+
                              authDate+'/'+
                              region+'/'+
                              myService+'/aws4_request,'+
                              'SignedHeaders=accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token '+
                              'Signature='+authKey;

            var requestOptions = {
                'method': 'GET',
                'uri': 'https://api.riiotlabs.com/prod/swimming_pool?deleted=false',
		'gzip': true,
                headers: {
                    'accept-encoding': 'gzip;q=1.0,compress;q=0.5',
                    'accept-language': 'de-DE;q=1.0',
                    'host': 'api.riiotlabs.com',
                    'user-agent': 'aws-sdk-iOS/2.4.6 iOS/13.1 de_DE',
                    'x-amz-date': amzDate,
                    'x-amz-security-token': session_token,
                    'authorization': authString
                }
            };

            request.get(requestOptions, function(error, response, body) {

                var result = JSON.parse(body);
		//bc.log.debug("getPool:\n" + body);
               
                for(var el in result["data"]) {
                    for(var value in result["data"][el]) {
                        if(typeof(result["data"][el][value])!=="object") {                        
			    if(value=="swimming_pool_id") {
				getBlue(access_key, secret_key, session_token, result["data"][el][value]);
			    }
                        }
                    }
                }

            
            });
            
        }

	function getBlue(access_key, secret_key, session_token, poolID) {
	    
            var myMethod = 'GET';
            var myPath = '/prod/swimming_pool/' + poolID + '/blue';
            var region = 'eu-west-1';
            var myService = 'execute-api';
            
            var amzDate = getAmzDate(new Date().toISOString());
            var authDate = amzDate.split("T")[0];
            var payload = '';
            var hashedPayload = crypto.SHA256(payload).toString();

            var canonicalReq =  myMethod + '\n' +
                                myPath + '\n' +
                                'deleted=false\n' +
                                'accept-encoding:gzip;q=1.0,compress;q=0.5\n' +
                                'accept-language:de-DE;q=1.0\n' +
                                'host:api.riiotlabs.com\n' +
                                'user-agent:aws-sdk-iOS/2.4.6 iOS/13.1 de_DE\n' +
                                'x-amz-date:' + amzDate + '\n' +
                                'x-amz-security-token:' + session_token + '\n' + 
                                '\n' +
                                'accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token' + '\n' +
                                hashedPayload;

            var canonicalReqHash = crypto.SHA256(canonicalReq).toString();
            var stringToSign =  'AWS4-HMAC-SHA256\n' +
                                amzDate + '\n' +
                                authDate+'/'+region+'/'+myService+'/aws4_request\n'+
                                canonicalReqHash;

            var signingKey = getSignatureKey(crypto, secret_key, authDate, region, myService);
            var authKey = crypto.HmacSHA256(stringToSign, signingKey);

            var authString  = 'AWS4-HMAC-SHA256 ' +
                              'Credential='+
                              access_key+'/'+
                              authDate+'/'+
                              region+'/'+
                              myService+'/aws4_request,'+
                              'SignedHeaders=accept-encoding;accept-language;host;user-agent;x-amz-date;x-amz-security-token '+
                              'Signature='+authKey;

            var requestOptions = {
                'method': 'GET',
		'gzip': true,
                'uri': 'https://api.riiotlabs.com/prod/swimming_pool/' + poolID + '/blue?deleted=false',
                headers: {
                    'accept-encoding': 'gzip;q=1.0,compress;q=0.5',
                    'accept-language': 'de-DE;q=1.0',
                    'host': 'api.riiotlabs.com',
                    'user-agent': 'aws-sdk-iOS/2.4.6 iOS/13.1 de_DE',
                    'x-amz-date': amzDate,
                    'x-amz-security-token': session_token,
                    'authorization': authString
                }
            };

            request.get(requestOptions, function(error, response, body) {

                var result = JSON.parse(body);
		//bc.log.debug("getBlue:\n" + body);

		for(var el in result) {
                    if(typeof(result[el])=="string") {
                        process(el, result[el], "", poolID);
                    }
                }

               
                for(var el in result["data"]) {
                    for(var value in result["data"][el]) {
                        if(typeof(result["data"][el][value])!=="object") {                        
			    if(value=="blue_device_serial") {
                                getMeasurements(access_key, secret_key, session_token, poolID, result["data"][el][value]);
				getGuidance(access_key, secret_key, session_token, poolID, result["data"][el][value]);
				getFeed(access_key, secret_key, session_token, poolID, result["data"][el][value]);
			    } else {
				//process(value, result["data"][el][value], result["data"][el]["name"], poolID);
			    }
			    
      		        } else {
			    for(var valueBelow in result["data"][el][value]) {
				if(typeof(result["data"][el][value][valueBelow])!=="object") { 
					//bc.log.debug(valueBelow + ": " + result["data"][el][value][valueBelow]);
					process(valueBelow, result["data"][el][value][valueBelow], "", poolID);	
				}    	
			    }
		        }
                    }
                }

		
            
            });
            
        }


        
        request.post({
            method: 'POST',
            uri: 'https://api.riiotlabs.com/prod/user/login',
            body: {'email':email,'password':password},
	    //encoding: null,
	    gzip: true,
            headers:{
                'accept-language':'de-DE;q=1.0',
                'user-agent':'Blue Connect/2.21.0 (com.riiotlabs.blue; build:190827.1727; iOS 13.1.0) Alamofire/4.8.2',
                'accept-encoding':'gzip;q=1.0, compress;q=0.5',
                'content-type':'application/json',
                'accept':'*/*'
            },
            json: true
        },  function (error, response, body) {
            //bc.log.debug("Encoding: " + response.headers['content-encoding']);
	    
	    try {

            	var access_key = body.credentials.access_key;
		//bc.log.debug("Access Key: " + access_key);
            	var secret_key = body.credentials.secret_key;
		//bc.log.debug("Secret Key: " + secret_key);
            	var session_token = body.credentials.session_token;
		//bc.log.debug("Token: " + session_token);
	    	getPool(access_key, secret_key, session_token);
	   } catch (e) {
		bc.log.debug("Error getting credentials!");
	   };
        });
                
        this.subscribeStates('*');

	setTimeout(function() {bc.stop();}, 10000);

    }

    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

}

if (module.parent) {
    module.exports = (options) => new Blueconnect(options);
} else {
    new Blueconnect();
}
