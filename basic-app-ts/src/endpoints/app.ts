import * as ccfapp from "@microsoft/ccf-app";
import {ccf} from "@microsoft/ccf-app/global";

interface Request {
    value : string;
}

interface Response {
    echoed_value: string;
}

interface ErrorResponse {
	error: string;
}

export function echo_handler(request: ccfapp.Request<Request>): 
    ccfapp.Response<Response|ErrorResponse> {
	const body = request.body.json();

	if (typeof body.value != "string") {
		return {
			statusCode: 400,
			body: {
				error: "Invalid body type"
			},
		};
	}

	return {
		body: {
			echoed_value: body.value,
		},
	};
}
