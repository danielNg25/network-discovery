import axios from 'axios';

interface IPInfo {
    ip: string;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    isp: string;
    org: string;
    as: string;
    lat: number;
    lon: number;
}

async function lookupIP(ip: string): Promise<IPInfo> {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return response.data;
    } catch (error) {
        console.error(`Error looking up IP ${ip}:`, error);
        throw error;
    }
}

async function main() {
    const ips = [
        '146.190.163.83',
        '34.88.230.215',
        '34.116.238.126',
        '91.134.71.21',
        '162.55.239.166',
        '65.108.128.251',
        '37.27.225.52',
        '69.67.149.105',
        '35.211.161.35',
        '35.237.65.141',
        '195.189.96.121',
        '152.53.121.15',
        '178.63.42.97',
        '211.219.19.79',
        '207.188.7.169',
        '51.159.20.50',
        '18.117.216.69',
        '34.65.109.135',
        '51.15.16.14',
        '132.145.196.86',
        '146.148.61.172',
        '141.98.217.86',
        '34.65.245.189',
        '34.88.78.125',
        '146.59.118.198',
        '152.53.114.91',
        '57.128.187.32',
        '134.122.42.130',
        '152.53.124.150',
        '35.246.149.9',
        '46.166.162.42',
        '35.211.121.91',
        '34.126.123.46',
        '141.94.155.97',
        '35.207.25.245',
        '35.211.19.204',
        '34.89.146.250',
        '150.136.221.45',
        '34.159.94.117',
        '57.128.187.248',
        '103.88.234.227',
        '65.109.119.56',
        '141.94.248.83',
        '141.147.145.117',
        '135.181.21.165',
        '144.76.5.118',
    ];

    console.log('IP Address Lookup Results:\n');
    console.log('IP Address\t\tCountry\t\tCity\t\tISP\t\tAS');
    console.log(
        '--------------------------------------------------------------------------------'
    );

    for (const ip of ips) {
        try {
            const info = await lookupIP(ip);
            console.log(
                `${ip}\t${info.country}\t${info.city}\t${info.isp}\t${info.as}`
            );
            // Add delay to respect API rate limits
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            console.log(`${ip}\tError looking up IP`);
        }
    }
}

main().catch(console.error);
